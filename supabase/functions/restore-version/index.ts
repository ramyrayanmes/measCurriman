// supabase/functions/restore-version/index.ts
//
// POST body: { "table": "curricula" | "weekly_plans", "record_id": "<uuid>", "version_number": <int> }
// Allowed: admins, Stage Heads (anywhere in their stage), and Department
// Heads (only for the specific subject they head). RLS enforces the
// actual scope — this function just confirms the caller can reach the
// record at all before handing off to the service-role restore.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    const body = await req.json();
    const { table, record_id, version_number } = body;

    if (!["curricula", "weekly_plans"].includes(table) || !record_id || !version_number) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid table/record_id/version_number" }),
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

    // Fetching the record with the CALLER's own token doubles as the
    // access check: RLS (admin / Stage Head / Department Head policies,
    // all already in place) decides whether this row comes back at all.
    const { data: record, error: recordError } = await userClient
      .from(table)
      .select("id")
      .eq("id", record_id)
      .maybeSingle();

    if (recordError || !record) {
      return new Response(JSON.stringify({ error: "Not found or no access to this record" }), { status: 404, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fn = table === "curricula" ? "restore_curriculum_version" : "restore_weekly_plan_version";
    const params = table === "curricula"
      ? { p_curriculum_id: record_id, p_version_number: version_number, p_actor: user.id }
      : { p_weekly_plan_id: record_id, p_version_number: version_number, p_actor: user.id };

    const { error: rpcError } = await adminClient.rpc(fn, params);
    if (rpcError) throw rpcError;

    return new Response(JSON.stringify({ restored: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
