// supabase/functions/send-notification-email/index.ts
//
// Triggered by a Database Webhook (INSERT on public.notifications). Emails the
// recipient about a new named curriculum version or a new official version.
// Inactive recipients are skipped.
//
// Optional secret: APP_URL (adds a link to the app at the end of the email).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SECTION_LABELS: Record<string, string> = {
  courseDescription: "Course description",
  courseObjectives: "Course objectives",
  learningOutcomes: "Learning outcomes",
  courseContent: "Course content",
  teachingMethods: "Teaching methods",
  projects: "Projects",
  trips: "Trips",
  gradingCriteria: "Grading criteria",
  curriculumOutlineSemesterOne: "Outline - Semester 1",
  curriculumOutlineSemesterTwo: "Outline - Semester 2",
  meta: "Details",
  courseMaterials: "Materials & Resources",
  internships: "Internships & Events",
  notes: "Notes & Changes",
};

function asciiOnly(s: string): string {
  return s.replace(/[\u2012-\u2015]/g, "-").replace(/[^\x20-\x7E]/g, "");
}

function cleanText(t: string): string {
  return t.replace(/[ \t]+$/gm, "");
}

Deno.serve(async (req) => {
  const expected = Deno.env.get("WEBHOOK_SECRET");
  const provided = req.headers.get("x-webhook-secret");
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const payload = await req.json();
    const n = payload.record;
    if (!n?.recipient_id) {
      return new Response(JSON.stringify({ skipped: "no notification record" }), { status: 200 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: recipient } = await admin
      .from("profiles").select("email, full_name, active").eq("id", n.recipient_id).single();
    if (!recipient?.email) throw new Error("Recipient has no email on file");
    if (recipient.active === false) {
      return new Response(JSON.stringify({ skipped: "recipient inactive" }), { status: 200 });
    }

    let courseTitle = "";
    if (n.course_id) {
      const { data: c } = await admin
        .from("courses")
        .select("name, departments(name), grades(name)")
        .eq("id", n.course_id).single();
      if (c) courseTitle = `${c.departments?.name ?? ""} - ${c.grades?.name ?? c.name ?? ""}`;
    }

    const lines: string[] = [n.message ?? ""];
    if (courseTitle) lines.push(`Course: ${courseTitle}`);

    if (n.related_table === "curriculum_versions" && n.related_id) {
      const { data: v } = await admin
        .from("curriculum_versions")
        .select("name, version_number, change_note, change_summary, created_at, author:profiles!curriculum_versions_author_id_fkey(full_name, email)")
        .eq("id", n.related_id).single();
      if (v) {
        lines.push(`Version: #${v.version_number} "${v.name}"`);
        lines.push(`Saved by: ${v.author?.full_name || v.author?.email || "unknown"}`);
        if (n.type === "new_version") {
          const changed = (v.change_summary ?? []).map((k: string) =>
            k === "first version" ? "first version" : (SECTION_LABELS[k] ?? k));
          lines.push(`Sections changed: ${changed.length ? changed.join(", ") : "none"}`);
          if (v.change_note) lines.push(`Note from author: ${v.change_note}`);
        }
      }
    }

    const appUrl = Deno.env.get("APP_URL");
    if (appUrl) lines.push("", `Open CurriMan: ${appUrl}`);
    lines.push("", "-- CurriMan, Modern Education American School");

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
    await client.send({
      from: Deno.env.get("GMAIL_ADDRESS")!,
      to: recipient.email,
      subject: asciiOnly(`CurriMan: ${n.title}${courseTitle ? ` (${courseTitle})` : ""}`),
      content: cleanText(lines.join("\n")),
    });
    await client.close();

    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
