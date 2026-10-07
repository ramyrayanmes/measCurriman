// supabase/functions/export-document/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType,
} from "https://esm.sh/docx@8.5.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

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

    if (!["curricula", "weekly_plans"].includes(table) || !record_id || !["docx", "pdf"].includes(format)) {
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

    let fileBytes: Uint8Array;
    let fileName: string;

    if (table === "curricula") {
      const { data: curriculum, error } = await userClient
        .from("curricula")
        .select("*, subjects(name, grade_level)")
        .eq("id", record_id)
        .single();

      if (error || !curriculum) {
        return new Response(JSON.stringify({ error: "Not found or no access" }), { status: 404, headers: corsHeaders });
      }

      fileName = `${curriculum.title.replace(/[^a-z0-9]+/gi, "_")}.${format}`;
      fileBytes = format === "docx"
        ? await buildCurriculumDocx(curriculum)
        : await buildCurriculumPdf(curriculum);

    } else {
      const { data: plan, error: planError } = await userClient
        .from("weekly_plans")
        .select("*, subjects(name), profiles(full_name)")
        .eq("id", record_id)
        .single();

      if (planError || !plan) {
        return new Response(JSON.stringify({ error: "Not found or no access" }), { status: 404, headers: corsHeaders });
      }

      const { data: periods } = await userClient
        .from("lesson_periods")
        .select("*")
        .eq("weekly_plan_id", record_id)
        .order("lesson_date", { ascending: true });

      fileName = `WeeklyPlan_Wk${plan.week_number}_${plan.subjects?.name ?? "Subject"}.${format}`
        .replace(/[^a-z0-9._]+/gi, "_");
      fileBytes = format === "docx"
        ? await buildWeeklyPlanDocx(plan, periods ?? [])
        : await buildWeeklyPlanPdf(plan, periods ?? []);
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

// ---------------- DOCX builders ----------------

async function buildCurriculumDocx(c: any): Promise<Uint8Array> {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: c.title, heading: HeadingLevel.TITLE }),
        new Paragraph({ text: `Subject: ${c.subjects?.name ?? ""}  |  Grade: ${c.subjects?.grade_level ?? ""}  |  Year: ${c.academic_year ?? ""}` }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "Learning Objectives", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: c.learning_objectives ?? "" }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "Standards", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: c.standards ?? "" }),
      ],
    }],
  });
  return await Packer.toBuffer(doc);
}

async function buildWeeklyPlanDocx(plan: any, periods: any[]): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({ text: "Weekly Lesson Plan", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Semester: ${plan.semester}   Week: ${plan.week_number}   Grade: ${plan.grade_level ?? ""}` }),
    new Paragraph({ text: `Subject: ${plan.subjects?.name ?? ""}   Teacher: ${plan.profiles?.full_name ?? ""}` }),
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

async function buildCurriculumPdf(c: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage();
  let y = page.getHeight() - 50;
  const left = 50;

  const writeLine = (text: string, size = 11, useBold = false, gap = 16) => {
    if (y < 50) { page = pdf.addPage(); y = page.getHeight() - 50; }
    page.drawText(text, { x: left, y, size, font: useBold ? bold : font, color: rgb(0, 0, 0) });
    y -= gap;
  };

  writeLine(c.title, 20, true, 30);
  writeLine(`Subject: ${c.subjects?.name ?? ""}   Grade: ${c.subjects?.grade_level ?? ""}   Year: ${c.academic_year ?? ""}`);
  writeLine("");
  writeLine("Learning Objectives", 14, true, 20);
  for (const line of wrapText(c.learning_objectives ?? "", 90)) writeLine(line);
  writeLine("");
  writeLine("Standards", 14, true, 20);
  for (const line of wrapText(c.standards ?? "", 90)) writeLine(line);

  return await pdf.save();
}

// Real bordered table, landscape pages for width. Each period gets a main
// row (the template's core columns) plus a second full-width row for the
// longer free-text fields (materials, differentiation, reflection, etc.)
// — mirroring the Word version's layout.
async function buildWeeklyPlanPdf(plan: any, periods: any[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 792, PAGE_H = 612; // Letter landscape
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
      `Semester: ${plan.semester}   Week: ${plan.week_number}   Grade: ${plan.grade_level ?? ""}   Subject: ${plan.subjects?.name ?? ""}   Teacher: ${plan.profiles?.full_name ?? ""}`,
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

    // Main row
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

    // Details row (full width)
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
