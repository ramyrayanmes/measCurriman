// supabase/functions/weekly-compliance-report/index.ts
//
// Builds, per subject, a checklist of which assigned teachers submitted a
// weekly lesson plan covering the Sunday–Thursday week, plus a list of
// retroactive submissions (plans created during the report week whose dates
// fall in an earlier week).
//
// Two ways to call it:
//   1. Cron:  header  x-cron-secret: <CRON_SECRET>   (always sends for real unless body.mode = "test")
//   2. Admin: normal login token, body { mode: "preview" | "test" | "send", week_start?: "YYYY-MM-DD" }
//        preview = return the report as JSON, send nothing
//        test    = send every email, but only to the calling admin
//        send    = send for real to the heads and meas.curricula@mes.edu.eg
//
// Deploy with:  supabase functions deploy weekly-compliance-report --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUMMARY_ADDRESS = "meas.curricula@mes.edu.eg";
const TZ = "Africa/Cairo";

// ---------------- date helpers (dates are 'YYYY-MM-DD' strings) ----------------

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay(); // 0 = Sunday
}

function cairoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

// The most recent Sunday whose Thursday has already passed.
function defaultWeekStart(): string {
  const today = cairoToday();
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i);
    if (dayOfWeek(d) === 0 && addDays(d, 4) <= today) return d;
  }
  return addDays(today, -6);
}

// The instant (ISO, UTC) that is 00:00 Cairo time on the given date,
// accounting for Egypt's daylight saving offset on that date.
function cairoMidnightUtc(dateStr: string): string {
  const probe = new Date(dateStr + "T12:00:00Z");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(probe);
  const raw = parts.find(p => p.type === "timeZoneName")?.value ?? "GMT+02:00";
  const m = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offset = m ? `${m[1]}${m[2]}:${m[3]}` : "+02:00";
  return new Date(`${dateStr}T00:00:00${offset}`).toISOString();
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-GB", {
    timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fmtCreated(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}

// Short, plain-ASCII range for email subjects (no special dash characters,
// which have to be header-encoded and break on long lines).
function shortRange(start: string, end: string): string {
  const a = new Date(start + "T00:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
  const b = new Date(end + "T00:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  return `${a} - ${b}`;
}

function asciiOnly(s: string): string {
  return s.replace(/[\u2012-\u2015]/g, "-").replace(/[^\x20-\x7E]/g, "");
}

// The mail library mangles any line that ends in whitespace (it shows up as a
// stray "=20" in the email). So strip formatting whitespace out of the HTML
// before sending, and trim trailing spaces from the plain-text version.
function compactHtml(h: string): string {
  return h.replace(/\n\s*/g, "");
}

function cleanText(t: string): string {
  return t.replace(/[ \t]+$/gm, "");
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------- report building ----------------

async function buildReport(admin: any, weekStart: string) {
  const weekEnd = addDays(weekStart, 4); // Thursday
  const createdFrom = cairoMidnightUtc(weekStart);
  const createdTo = cairoMidnightUtc(addDays(weekStart, 7));

  const [{ data: subjects }, { data: ts }, { data: dhs }, { data: profiles }] = await Promise.all([
    admin.from("subjects").select("id, name, grade_level").order("name"),
    admin.from("teacher_subjects").select("teacher_id, subject_id"),
    admin.from("department_head_subjects").select("user_id, subject_id"),
    admin.from("profiles").select("id, full_name, email"),
  ]);

  const profileById = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

  const planCols = "id, subject_id, teacher_id, week_number, semester, date_from, date_to, created_at";

  // Plans whose date range overlaps the Sunday–Thursday week
  const { data: weekPlans } = await admin
    .from("weekly_plans").select(planCols)
    .lte("date_from", weekEnd).gte("date_to", weekStart);

  // Retroactive: created during the report week, but dates entirely before it
  const { data: retroPlans } = await admin
    .from("weekly_plans").select(planCols)
    .gte("created_at", createdFrom).lt("created_at", createdTo)
    .lt("date_to", weekStart);

  const reports = (subjects ?? []).map((s: any) => {
    const teacherIds = (ts ?? []).filter((r: any) => r.subject_id === s.id).map((r: any) => r.teacher_id);
    const headIds = (dhs ?? []).filter((r: any) => r.subject_id === s.id).map((r: any) => r.user_id);

    const teachers = teacherIds.map((id: string) => {
      const p = profileById.get(id);
      const plans = (weekPlans ?? []).filter((w: any) => w.subject_id === s.id && w.teacher_id === id);
      return {
        id,
        name: p?.full_name ?? "(unknown)",
        email: p?.email ?? "",
        submitted: plans.length > 0,
        plans: plans.map((w: any) => ({
          week_number: w.week_number, semester: w.semester, date_from: w.date_from, date_to: w.date_to,
        })),
      };
    });

    const retroactive = (retroPlans ?? [])
      .filter((w: any) => w.subject_id === s.id)
      .map((w: any) => ({
        teacher: profileById.get(w.teacher_id)?.full_name ?? "(unknown)",
        week_number: w.week_number, semester: w.semester,
        date_from: w.date_from, date_to: w.date_to,
        created_at: w.created_at,
      }));

    const heads = headIds.map((id: string) => {
      const p = profileById.get(id);
      return { id, name: p?.full_name ?? "(unknown)", email: p?.email ?? "" };
    });

    return {
      subject_id: s.id, subject_name: s.name, grade_level: s.grade_level,
      heads, teachers, retroactive,
    };
  }).filter((r: any) => r.teachers.length > 0 || r.retroactive.length > 0);

  return { weekEnd, reports };
}

// ---------------- rendering ----------------

function subjectTitle(r: any): string {
  return `${r.subject_name}${r.grade_level ? ` (Grade ${r.grade_level})` : ""}`;
}

function planLabel(p: any): string {
  return `Week ${p.week_number} (Sem ${p.semester}): ${p.date_from} to ${p.date_to}`;
}

function renderSubjectHtml(r: any, showHeads: boolean): string {
  const submittedCount = r.teachers.filter((t: any) => t.submitted).length;
  const rows = r.teachers.map((t: any) => `
    <tr>
      <td>${esc(t.name)}</td>
      <td style="color:${t.submitted ? "#16a34a" : "#dc2626"}">${t.submitted ? "✓ Submitted" : "✗ Not submitted"}</td>
      <td>${t.submitted ? t.plans.map((p: any) => esc(planLabel(p))).join("<br>") : "—"}</td>
    </tr>`).join("");

  const heads = showHeads
    ? `<p style="color:#666;margin:2px 0 8px">Department head(s): ${r.heads.length ? r.heads.map((h: any) => esc(h.name)).join(", ") : "none assigned"}</p>`
    : "";

  const retro = r.retroactive.length
    ? `<p style="margin:12px 0 4px"><strong>Retroactive submissions</strong> (created this week for earlier weeks):</p>
       <ul style="margin:0">${r.retroactive.map((x: any) =>
         `<li>${esc(x.teacher)} — ${esc(planLabel(x))} — created ${esc(fmtCreated(x.created_at))}</li>`).join("")}</ul>`
    : "";

  const table = r.teachers.length
    ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
         <tr style="background:#f3f4f6"><th align="left">Teacher</th><th align="left">Status</th><th align="left">Plan(s) covering this week</th></tr>
         ${rows}
       </table>`
    : `<p style="color:#666">No teachers assigned to this subject.</p>`;

  return `<h3 style="margin:20px 0 4px">${esc(subjectTitle(r))} — ${submittedCount} of ${r.teachers.length} submitted</h3>
    ${heads}${table}${retro}`;
}

function renderSubjectText(r: any, showHeads: boolean): string {
  const submittedCount = r.teachers.filter((t: any) => t.submitted).length;
  const lines = [`${subjectTitle(r)} — ${submittedCount} of ${r.teachers.length} submitted`];
  if (showHeads) lines.push(`  Department head(s): ${r.heads.length ? r.heads.map((h: any) => h.name).join(", ") : "none assigned"}`);
  for (const t of r.teachers) {
    lines.push(`  ${t.submitted ? "[x]" : "[ ]"} ${t.name}${t.submitted ? " — " + t.plans.map(planLabel).join("; ") : " — not submitted"}`);
  }
  if (r.retroactive.length) {
    lines.push("  Retroactive submissions (created this week for earlier weeks):");
    for (const x of r.retroactive) lines.push(`    - ${x.teacher} — ${planLabel(x)} — created ${fmtCreated(x.created_at)}`);
  }
  return lines.join("\n");
}

function planEmails(reports: any[], weekStart: string, weekEnd: string) {
  const label = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;
  const subject = `CurriMan weekly report: ${shortRange(weekStart, weekEnd)}`;
  const wrap = (intro: string, body: string) =>
    `<div style="font-family:Arial,sans-serif">
       <p style="margin:0;font-size:13px;font-weight:bold;color:#1a56db">CurriMan</p>
       <h2 style="margin-bottom:4px">Weekly lesson plan submission report</h2>
       <p style="color:#666;margin-top:0">${esc(label)} (Sunday–Thursday). ${esc(intro)}</p>
       ${body}
     </div>`;

  const emails: any[] = [];

  // One email per department head, covering all of their subjects
  const byHead = new Map<string, { name: string; email: string; reports: any[] }>();
  for (const r of reports) {
    for (const h of r.heads) {
      if (!h.email) continue;
      const entry = byHead.get(h.id) ?? { name: h.name, email: h.email, reports: [] };
      entry.reports.push(r);
      byHead.set(h.id, entry);
    }
  }
  for (const h of byHead.values()) {
    emails.push({
      to: h.email,
      subject,
      subjects_count: h.reports.length,
      html: wrap("Here is the submission status for the subject(s) you head.", h.reports.map(r => renderSubjectHtml(r, false)).join("")),
      text: `CurriMan - Weekly lesson plan submissions — ${label}\n\n` + h.reports.map(r => renderSubjectText(r, false)).join("\n\n"),
    });
  }

  // One consolidated email for meas.curricula
  if (reports.length > 0) {
    emails.push({
      to: SUMMARY_ADDRESS,
      subject: `${subject} (all subjects)`,
      subjects_count: reports.length,
      html: wrap("Consolidated report for all subjects.", reports.map(r => renderSubjectHtml(r, true)).join("")),
      text: `CurriMan - Weekly lesson plan submissions — ${label} (all subjects)\n\n` + reports.map(r => renderSubjectText(r, true)).join("\n\n"),
    });
  }

  return emails;
}

// ---------------- handler ----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode ?? "send";
    let testRecipient: string | null = null;

    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-cron-secret");

    if (cronSecret && providedSecret && providedSecret === cronSecret) {
      // Scheduled/cron path
      testRecipient = body.test_recipient ?? null;
    } else {
      // Admin path
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: corsHeaders });
      }
      const { data: profile } = await userClient.from("profiles").select("role, email").eq("id", user.id).single();
      if (profile?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Only admins may run this report" }), { status: 403, headers: corsHeaders });
      }
      testRecipient = profile.email ?? user.email ?? null;
    }

    if (!["preview", "test", "send"].includes(mode)) {
      return new Response(JSON.stringify({ error: "mode must be preview, test, or send" }), { status: 400, headers: corsHeaders });
    }
    if (mode === "test" && !testRecipient) {
      return new Response(JSON.stringify({ error: "Test mode needs a recipient" }), { status: 400, headers: corsHeaders });
    }

    const weekStart: string = body.week_start ?? defaultWeekStart();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || dayOfWeek(weekStart) !== 0) {
      return new Response(JSON.stringify({ error: "week_start must be a Sunday, formatted YYYY-MM-DD" }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { weekEnd, reports } = await buildReport(admin, weekStart);
    const emails = planEmails(reports, weekStart, weekEnd);

    if (mode === "preview") {
      return new Response(
        JSON.stringify({
          week_start: weekStart, week_end: weekEnd, subjects: reports,
          emails: emails.map(e => ({ to: e.to, subject: e.subject, subjects_count: e.subjects_count })),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

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

    const sent: any[] = [];
    for (const e of emails) {
      const actualTo = mode === "test" ? testRecipient! : e.to;
      const subject = asciiOnly(mode === "test" ? `[TEST] ${e.subject}` : e.subject);
      const rawHtml = mode === "test"
        ? `<p style="background:#fef9c3;padding:8px;font-family:Arial,sans-serif"><strong>TEST EMAIL</strong> - this would normally have been sent to: ${esc(e.to)}</p>${e.html}`
        : e.html;
      const rawText = mode === "test"
        ? `*** TEST EMAIL - this would normally have been sent to: ${e.to} ***\n\n${e.text}`
        : e.text;
      const html = compactHtml(rawHtml);
      const text = cleanText(rawText);
      try {
        await client.send({ from: Deno.env.get("GMAIL_ADDRESS")!, to: actualTo, subject, content: text, html });
        sent.push({ to: e.to, delivered_to: actualTo, status: "sent" });
      } catch (err) {
        console.error("Failed to send to", actualTo, err);
        sent.push({ to: e.to, delivered_to: actualTo, status: "failed", error: String(err) });
      }
    }
    await client.close();

    return new Response(
      JSON.stringify({ week_start: weekStart, week_end: weekEnd, mode, subjects: reports, emails: sent }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
