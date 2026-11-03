// supabase/functions/export-document/index.ts
//
// POST body: { "table": "curriculum_versions" | "curriculum_working" | "weekly_plans", "record_id": "<uuid>", "format": "docx" | "pdf" }
//   curriculum_versions: record_id is a version id (access follows the version's RLS)
//   curriculum_working:  record_id is a course id; exports the caller's own working copy
//
// Auditors: PDF only (enforced here, server-side). Every auditor PDF
// download is logged to downloads_log and emailed (to the auditor and to
// meas.curricula@mes.edu.eg) with what was downloaded and when.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType,
} from "https://esm.sh/docx@8.5.0";
import * as pdfLib from "https://esm.sh/pdf-lib@1.17.1";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { TEMPLATE_BASE64 } from "./templateData.ts";
import { fillDocumentXml, fillFooterXml } from "./curriculumDocx.ts";
import { buildCurriculumPdf } from "./curriculumPdf.ts";

const { PDFDocument, StandardFonts, rgb } = pdfLib;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

const AUDIT_COPY_ADDRESS = "meas.curricula@mes.edu.eg";

const BLOOMS_LABELS: Record<number, string> = {
  1: "Remembering", 2: "Understanding", 3: "Applying",
  4: "Analyzing", 5: "Evaluating", 6: "Creating",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405, headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const { table, record_id, format } = await req.json();

    if (!["curriculum_versions", "curriculum_working", "weekly_plans"].includes(table) || !record_id || !["docx", "pdf"].includes(format)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid table/record_id/format" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: corsHeaders });
    }

    const { data: profile } = await userClient
      .from("profiles")
      .select("role, email")
      .eq("id", user.id)
      .single();

    const isAuditor = profile?.role === "auditor";
    if (isAuditor && format !== "pdf") {
      return new Response(
        JSON.stringify({ error: "Auditors may only download PDFs" }),
        { status: 403, headers: corsHeaders }
      );
    }

    let fileBytes: Uint8Array;
    let fileName: string;
    let description: string;

    if (table !== "weekly_plans") {
      let version: any = null;
      let courseId: string = record_id;

      if (table === "curriculum_versions") {
        const { data, error } = await userClient
          .from("curriculum_versions")
          .select("id, course_id, name, version_number, content")
          .eq("id", record_id)
          .maybeSingle();
        if (error || !data) {
          return new Response(
            JSON.stringify({ error: `Version not found or no access${error ? `: ${error.message}` : ""}` }),
            { status: 404, headers: corsHeaders }
          );
        }
        version = data;
        courseId = data.course_id;
      } else {
        const { data, error } = await userClient
          .from("curriculum_working_copies")
          .select("course_id, content")
          .eq("user_id", user.id)
          .eq("course_id", record_id)
          .maybeSingle();
        if (error || !data) {
          return new Response(
            JSON.stringify({ error: "You have no saved working copy for this course yet" }),
            { status: 404, headers: corsHeaders }
          );
        }
        version = { ...data, name: "Working copy", version_number: null };
      }

      const { data: courseRow } = await userClient
        .from("courses")
        .select("name, departments(name), grades(name)")
        .eq("id", courseId)
        .maybeSingle();
      const course: any = courseRow ?? {};

      // Older or partial documents may lack the department/grade, so fall back to the course.
      const content = {
        ...version.content,
        meta: {
          ...(version.content?.meta ?? {}),
          department: version.content?.meta?.department || course.departments?.name || course.name || "",
          grade: version.content?.meta?.grade || course.grades?.name || "",
        },
      };

      const label = [content.meta.department, content.meta.grade].filter(Boolean).join(" ") || "Curriculum";
      const tag = version.version_number ? `v${version.version_number}` : "working_copy";
      fileName = `${label}_Curriculum_${tag}.${format}`.replace(/[^a-z0-9._-]+/gi, "_");
      description = `Curriculum "${label}" â€” ${version.version_number ? `v${version.version_number} ${version.name}` : "working copy"}`;
      fileBytes = format === "docx"
        ? await buildCurriculumDocx(content)
        : await buildCurriculumPdfFromTemplate(content);

    } else {
      const { data: planRow, error: planError } = await userClient
        .from("weekly_plans")
        .select("*")
        .eq("id", record_id)
        .single();

      if (planError || !planRow) {
        return new Response(
          JSON.stringify({ error: `Plan not found or no access${planError ? `: ${planError.message}` : ""}` }),
          { status: 404, headers: corsHeaders }
        );
      }

      // Related rows are fetched separately so one missing/blocked row can't hide the plan.
      const { data: courseRow } = await userClient
        .from("courses")
        .select("name, departments(name), grades(name)")
        .eq("id", planRow.course_id)
        .maybeSingle();
      const { data: teacherRow } = await userClient
        .from("profiles")
        .select("full_name")
        .eq("id", planRow.teacher_id)
        .maybeSingle();
      const plan = { ...planRow, courses: courseRow, profiles: teacherRow };

      const { data: periods } = await userClient
        .from("lesson_periods")
        .select("*")
        .eq("weekly_plan_id", record_id)
        .order("lesson_date", { ascending: true });

      const courseName = courseTitle(plan);
      fileName = `WeeklyPlan_Wk${plan.week_number}_${courseName}.${format}`
        .replace(/[^a-z0-9._]+/gi, "_");
      description = `Weekly lesson plan â€” Week ${plan.week_number} (Semester ${plan.semester}), ${courseName}, teacher: ${plan.profiles?.full_name ?? "unknown"}`;
      fileBytes = format === "docx"
        ? await buildWeeklyPlanDocx(plan, periods ?? [])
        : await buildWeeklyPlanPdf(plan, periods ?? []);
    }

    // Auditor downloads: log + notify. Logging/emailing problems are
    // reported in the function logs but never block the download itself.
    if (isAuditor) {
      await logAndNotify({
        userId: user.id,
        userEmail: profile?.email ?? user.email ?? "",
        table,
        recordId: record_id,
        description,
        format,
      });
    }

    return new Response(fileBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

// ---------------- Auditor logging + notification ----------------

// "Department â€” Grade" for regular courses, or the elective's own name.
function courseTitle(plan: any): string {
  const c = plan.courses;
  if (!c) return "Course";
  return c.name ?? [c.departments?.name, c.grades?.name].filter(Boolean).join(" â€” ");
}

async function logAndNotify(args: {
  userId: string; userEmail: string; table: string; recordId: string; description: string; format: string;
}) {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error: logError } = await adminClient.from("downloads_log").insert({
    user_id: args.userId,
    user_email: args.userEmail,
    record_table: args.table,
    record_id: args.recordId,
    record_description: args.description,
    format: args.format,
  });
  if (logError) console.error("downloads_log insert failed:", logError);

  try {
    const timestamp = new Date().toLocaleString("en-GB", {
      timeZone: "Africa/Cairo",
      dateStyle: "full",
      timeStyle: "medium",
    });

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: Deno.env.get("GMAIL_ADDRESS")!,
          password: Deno.env.get("GMAIL_APP_PASSWORD")!,
        },
      },
    });

    const recipients = Array.from(new Set([args.userEmail, AUDIT_COPY_ADDRESS].filter(Boolean)));

    await client.send({
      from: Deno.env.get("GMAIL_ADDRESS")!,
      to: recipients,
      subject: "CurriMan - document downloaded",
      content:
        `A document was downloaded from CurriMan.\n\n` +
        `Downloaded by: ${args.userEmail}\n` +
        `Document: ${args.description}\n` +
        `Format: ${args.format.toUpperCase()}\n` +
        `Date/time (Cairo): ${timestamp}\n`,
    });

    await client.close();
  } catch (err) {
    console.error("Download notification email failed:", err);
  }
}

// ---------------- DOCX builders ----------------

async function buildCurriculumDocx(content: any): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(TEMPLATE_BASE64, { base64: true });
  zip.file("word/document.xml", fillDocumentXml(await zip.file("word/document.xml")!.async("string"), content));
  for (const name of Object.keys(zip.files)) {
    if (/^word\/footer\d+\.xml$/.test(name)) {
      zip.file(name, fillFooterXml(await zip.file(name)!.async("string"), content));
    }
  }
  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function buildCurriculumPdfFromTemplate(content: any): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(TEMPLATE_BASE64, { base64: true });
  const logo = await zip.file("word/media/image1.png")?.async("uint8array");
  return await buildCurriculumPdf(pdfLib, content, logo);
}

async function buildWeeklyPlanDocx(plan: any, periods: any[]): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({ text: "Weekly Lesson Plan", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Semester: ${plan.semester}   Week: ${plan.week_number}   Grade: ${plan.grade_level ?? ""}` }),
    new Paragraph({ text: `Course: ${courseTitle(plan)}   Teacher: ${plan.profiles?.full_name ?? ""}` }),
    new Paragraph({ text: `Date: ${plan.date_from} to ${plan.date_to}` }),
    new Paragraph({ text: "" }),
  ];

  const tableRows: TableRow[] = [
    new TableRow({
      children: ["Class/Section", "Date", "Learning Objectives", "Description of Lesson", "Book & Pages", "Bloom's Levels"]
        .map(h => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })),
    }),
  ];

  for (const p of periods) {
    tableRows.push(new TableRow({
      children: [
        p.class_section, p.lesson_date, p.learning_objectives, p.description_of_lesson, p.book_pages,
        (p.blooms_levels ?? []).map((n: number) => BLOOMS_LABELS[n] ?? n).join(", "),
      ].map(v => new TableCell({ children: [new Paragraph({ text: String(v ?? "") })] })),
    }));
    tableRows.push(new TableRow({
      children: [new TableCell({
        columnSpan: 6,
        children: [
          new Paragraph({ text: `Materials/Resources: ${p.materials_resources ?? ""}` }),
          new Paragraph({ text: `Differentiation: ${p.differentiation ?? ""}` }),
          new Paragraph({ text: `Reflection: ${p.reflection ?? ""}` }),
          new Paragraph({ text: `Classwork: ${p.classwork ?? ""}` }),
          new Paragraph({ text: `Homework: ${p.homework ?? ""}` }),
        ],
      })],
    }));
  }

  const table = new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } });

  const doc = new Document({ sections: [{ children: [...children, table] }] });
  return await Packer.toBuffer(doc);
}

// ---------------- PDF builders ----------------

async function buildWeeklyPlanPdf(plan: any, periods: any[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 792, PAGE_H = 612;
  const MARGIN = 40;
  const FONT_SIZE = 8;
  const LINE_H = FONT_SIZE + 3;
  const CELL_PAD = 4;

  const columns = [
    { key: "class_section", label: "Class/Section", width: 90 },
    { key: "lesson_date", label: "Date", width: 65 },
    { key: "learning_objectives", label: "Learning Objectives", width: 150 },
    { key: "description_of_lesson", label: "Description of Lesson", width: 170 },
    { key: "book_pages", label: "Book & Pages", width: 90 },
    { key: "blooms", label: "Bloom's Levels", width: 127 },
  ];
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function drawHeaderInfo() {
    page.drawText("Weekly Lesson Plan", { x: MARGIN, y, size: 16, font: bold });
    y -= 20;
    page.drawText(
      `Semester: ${plan.semester}   Week: ${plan.week_number}   Grade: ${plan.grade_level ?? ""}   Course: ${courseTitle(plan)}   Teacher: ${plan.profiles?.full_name ?? ""}`,
      { x: MARGIN, y, size: 10, font }
    );
    y -= 14;
    page.drawText(`Date: ${plan.date_from} to ${plan.date_to}`, { x: MARGIN, y, size: 10, font });
    y -= 20;
  }

  function wrapForColumn(text: string, width: number): string[] {
    const charsPerLine = Math.max(6, Math.floor((width - CELL_PAD * 2) / (FONT_SIZE * 0.55)));
    return wrapText(text ?? "", charsPerLine);
  }

  function drawTableHeader() {
    let x = MARGIN;
    const headerHeight = LINE_H + CELL_PAD * 2;
    for (const col of columns) {
      page.drawRectangle({ x, y: y - headerHeight, width: col.width, height: headerHeight, borderColor: rgb(0, 0, 0), borderWidth: 0.75, color: rgb(0.9, 0.9, 0.9) });
      page.drawText(col.label, { x: x + CELL_PAD, y: y - CELL_PAD - FONT_SIZE, size: FONT_SIZE, font: bold });
      x += col.width;
    }
    y -= headerHeight;
  }

  function ensureSpace(neededHeight: number) {
    if (y - neededHeight < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawTableHeader();
    }
  }

  drawHeaderInfo();
  drawTableHeader();

  for (const p of periods) {
    const cellLines = columns.map(col => {
      if (col.key === "blooms") {
        const text = (p.blooms_levels ?? []).map((n: number) => BLOOMS_LABELS[n] ?? n).join(", ");
        return wrapForColumn(text, col.width);
      }
      return wrapForColumn(p[col.key], col.width);
    });
    const mainRowLines = Math.max(1, ...cellLines.map(l => l.length));
    const mainRowHeight = mainRowLines * LINE_H + CELL_PAD * 2;

    const detailsText = [
      `Materials/Resources: ${p.materials_resources ?? ""}`,
      `Differentiation: ${p.differentiation ?? ""}`,
      `Reflection: ${p.reflection ?? ""}`,
      `Classwork: ${p.classwork ?? ""}`,
      `Homework: ${p.homework ?? ""}`,
    ];
    const detailsCharsPerLine = Math.max(10, Math.floor((tableWidth - CELL_PAD * 2) / (FONT_SIZE * 0.55)));
    const detailsLines = detailsText.flatMap(t => wrapText(t, detailsCharsPerLine));
    const detailsHeight = detailsLines.length * LINE_H + CELL_PAD * 2;

    ensureSpace(mainRowHeight + detailsHeight);

    let x = MARGIN;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      page.drawRectangle({ x, y: y - mainRowHeight, width: col.width, height: mainRowHeight, borderColor: rgb(0, 0, 0), borderWidth: 0.75 });
      cellLines[i].forEach((line, li) => {
        page.drawText(line, { x: x + CELL_PAD, y: y - CELL_PAD - FONT_SIZE - li * LINE_H, size: FONT_SIZE, font });
      });
      x += col.width;
    }
    y -= mainRowHeight;

    page.drawRectangle({ x: MARGIN, y: y - detailsHeight, width: tableWidth, height: detailsHeight, borderColor: rgb(0, 0, 0), borderWidth: 0.75 });
    detailsLines.forEach((line, li) => {
      page.drawText(line, { x: MARGIN + CELL_PAD, y: y - CELL_PAD - FONT_SIZE - li * LINE_H, size: FONT_SIZE, font });
    });
    y -= detailsHeight;
  }

  if (periods.length === 0) {
    page.drawText("No class periods in this version.", { x: MARGIN, y: y - 14, size: 10, font });
  }

  return await pdf.save();
}

function wrapText(text: string, maxChars: number): string[] {
  const words = (text ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current += " " + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.length ? lines : [""];
}
