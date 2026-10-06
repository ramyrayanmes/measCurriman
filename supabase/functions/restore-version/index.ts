// supabase/functions/restore-version/index.ts
//
// POST body: { "table": "curricula" | "weekly_plans", "record_id": "<uuid>", "version_number": <int> }
// Admins and Heads (Stage or Department) may call this — actual row access
// is still enforced by RLS inside the SQL restore functions themselves,
// so a head can only ever restore something within their own scope.

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

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "";
    const isAdminOrHead = role === "admin" || role.startsWith("head_");

    if (profileError || !isAdminOrHead) {
      return new Response(JSON.stringify({ error: "Only admins and heads may restore a version" }), { status: 403, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Even though this runs with the service role, the SQL functions below
    // only touch the specific row requested — they don't themselves check
    // scope, so we verify the caller actually has RLS access to this record
    // using THEIR OWN token first, before performing the restore.
    const checkTable = table === "curricula" ? "curricula" : "weekly_plans";
    const { data: accessCheck, error: accessError } = await userClient
      .from(checkTable)
      .select("id")
      .eq("id", record_id)
      .maybeSingle();

    if (accessError || !accessCheck) {
      return new Response(JSON.stringify({ error: "Not found or no access to this record" }), { status: 404, headers: corsHeaders });
    }

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
