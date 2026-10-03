// supabase/functions/send-notification-email/index.ts
//
// Triggered by a Database Webhook whenever a new row is inserted into
// `notifications` (which itself happens automatically via a trigger whenever
// a curriculum_versions or weekly_plan_versions row is created).
//
// It looks up the two most recent versions for that record, builds a simple
// human-readable diff, looks up the recipient admin's email, and sends it
// via Gmail SMTP.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const notification = payload.record; // the newly inserted notifications row

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Figure out which versions table to compare, based on related_table
    const isCurriculum = notification.related_table === "curricula";
    const versionsTable = isCurriculum ? "curriculum_versions" : "weekly_plan_versions";
    const idColumn = isCurriculum ? "curriculum_id" : "weekly_plan_id";

    const { data: versions, error: versionsError } = await supabase
      .from(versionsTable)
      .select("*")
      .eq(idColumn, notification.related_id)
      .order("version_number", { ascending: false })
      .limit(2);

    if (versionsError) throw versionsError;

    const diffText = buildDiff(versions?.[1]?.snapshot, versions?.[0]?.snapshot, isCurriculum);

    // 2. Look up the recipient admin's email address
    const { data: userData, error: userError } =
      await supabase.auth.admin.getUserById(notification.recipient_id);
    if (userError) throw userError;
    const recipientEmail = userData.user?.email;
    if (!recipientEmail) throw new Error("Recipient has no email on file");

    // 3. Send the email via Gmail SMTP
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
      to: recipientEmail,
      subject: notification.title,
      content: `${notification.message}\n\nWhat changed:\n${diffText}`,
    });

    await client.close();

    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

// Builds a simple, readable list of which fields changed between two
// snapshot objects. Ignores noisy/internal fields like timestamps and ids.
function buildDiff(oldSnap: any, newSnap: any, isCurriculum: boolean): string {
  if (!oldSnap) return "This is the first saved version — no prior version to compare.";

  const ignoreFields = ["id", "created_at", "updated_at", "created_by", "updated_by"];
  const lines: string[] = [];

  if (isCurriculum) {
    for (const key of Object.keys(newSnap)) {
      if (ignoreFields.includes(key)) continue;
      if (JSON.stringify(oldSnap[key]) !== JSON.stringify(newSnap[key])) {
        lines.push(`- ${key}: "${oldSnap[key] ?? ""}" → "${newSnap[key] ?? ""}"`);
      }
    }
  } else {
    // weekly_plan snapshot shape: { plan: {...}, periods: [...] }
    for (const key of Object.keys(newSnap.plan)) {
      if (ignoreFields.includes(key)) continue;
      if (JSON.stringify(oldSnap.plan[key]) !== JSON.stringify(newSnap.plan[key])) {
        lines.push(`- plan.${key}: "${oldSnap.plan[key] ?? ""}" → "${newSnap.plan[key] ?? ""}"`);
      }
    }
    const oldCount = oldSnap.periods?.length ?? 0;
    const newCount = newSnap.periods?.length ?? 0;
    if (oldCount !== newCount) {
      lines.push(`- number of lesson periods: ${oldCount} → ${newCount}`);
    }
  }

  return lines.length ? lines.join("\n") : "No field-level changes detected.";
}