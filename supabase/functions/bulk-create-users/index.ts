// supabase/functions/bulk-create-users/index.ts
//
// POST body: { rows: [ { full_name, email, role, stage, subjects, department_head_of }, ... ] }
// - role: "admin" | "teacher" | "auditor" | "head"
// - stage: "kindergarten" | "elementary" | "middle" | "high" — required only when role is "head"
// - subjects: semicolon-separated subject names (teacher/auditor access)
// - department_head_of: semicolon-separated subject names (independent grant, any role)
//
// Existing users (matched by email) are UPDATED (name, role, and their
// subject/department-head lists are fully replaced by what's in the row).
// New users are CREATED with a random temp password. A row that fails
// validation is skipped — the rest of the file still processes — and
// every row's outcome is returned in the results summary.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_STAGES = ["kindergarten", "elementary", "middle", "high"];

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pwd = "";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (const b of bytes) pwd += chars[b % chars.length];
  return pwd;
}

function resolveRole(roleRaw: string, stageRaw: string): string {
  const role = (roleRaw ?? "").trim().toLowerCase();
  if (role === "head") {
    const stage = (stageRaw ?? "").trim().toLowerCase();
    if (!VALID_STAGES.includes(stage)) {
      throw new Error(`Invalid or missing stage "${stageRaw}" for role "head" (must be one of ${VALID_STAGES.join(", ")})`);
    }
    return `head_${stage}`;
  }
  if (!["admin", "teacher", "auditor"].includes(role)) {
    throw new Error(`Invalid role "${roleRaw}" (must be admin, teacher, auditor, or head)`);
  }
  return role;
}

function splitNames(raw: string): string[] {
  return (raw ?? "").split(";").map(s => s.trim()).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405, headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const { rows } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), { status: 400, headers: corsHeaders });
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

    const { data: callerProfile, error: callerError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerError || callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins may bulk-create users" }), { status: 403, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build a name → id lookup for subjects, once.
    const { data: subjects } = await adminClient.from("subjects").select("id, name");
    const subjectIdByName = new Map((subjects ?? []).map(s => [s.name.trim().toLowerCase(), s.id]));

    function resolveSubjectIds(names: string[]): string[] {
      const ids: string[] = [];
      for (const name of names) {
        const id = subjectIdByName.get(name.toLowerCase());
        if (!id) throw new Error(`Unknown subject "${name}"`);
        ids.push(id);
      }
      return ids;
    }

    const results: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2: 1-indexed plus header row

      try {
        const fullName = (row.full_name ?? "").trim();
        const email = (row.email ?? "").trim().toLowerCase();
        if (!fullName || !email) throw new Error("full_name and email are required");

        const role = resolveRole(row.role, row.stage);
        const subjectNames = splitNames(row.subjects);
        const deptHeadNames = splitNames(row.department_head_of);
        const subjectIds = resolveSubjectIds(subjectNames);
        const deptHeadIds = resolveSubjectIds(deptHeadNames);

        // Does a user with this email already exist?
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        let userId: string;
        let tempPassword: string | null = null;
        let status: string;

        if (existingProfile) {
          userId = existingProfile.id;
          const { error: updateError } = await adminClient
            .from("profiles")
            .update({ full_name: fullName, role })
            .eq("id", userId);
          if (updateError) throw updateError;
          status = "updated";
        } else {
          tempPassword = generateTempPassword();
          const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });
          if (createError) throw createError;
          userId = newUser.user.id;
          if (role !== "teacher") {
            await adminClient.from("profiles").update({ role }).eq("id", userId);
          }
          status = "created";
        }

        // Replace subject/department-head assignments with what's in this row.
        if (role === "teacher") {
          await adminClient.from("teacher_subjects").delete().eq("teacher_id", userId);
          if (subjectIds.length > 0) {
            await adminClient.from("teacher_subjects").insert(subjectIds.map(subject_id => ({ teacher_id: userId, subject_id })));
          }
        } else if (role === "auditor") {
          await adminClient.from("auditor_subjects").delete().eq("auditor_id", userId);
          if (subjectIds.length > 0) {
            await adminClient.from("auditor_subjects").insert(subjectIds.map(subject_id => ({ auditor_id: userId, subject_id })));
          }
        }

        await adminClient.from("department_head_subjects").delete().eq("user_id", userId);
        if (deptHeadIds.length > 0) {
          await adminClient.from("department_head_subjects").insert(deptHeadIds.map(subject_id => ({ user_id: userId, subject_id })));
        }

        results.push({ row: rowNum, email, status, temp_password: tempPassword });
      } catch (err) {
        results.push({ row: rowNum, email: row.email ?? "", status: "skipped", error: String(err.message ?? err) });
      }
    }

    return new Response(JSON.stringify({ results }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
