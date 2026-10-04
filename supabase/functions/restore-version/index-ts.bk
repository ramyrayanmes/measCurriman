// supabase/functions/restore-version/index.ts
//
// POST body: { "table": "curricula" | "weekly_plans", "record_id": "<uuid>", "version_number": <int> }
// Only admins may call this. Restoring creates a new version automatically —
// nothing is silently overwritten, and the restore itself is logged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const body = await req.json();
    const { table, record_id, version_number } = body;

    if (!["curricula", "weekly_plans"].includes(table) || !record_id || !version_number) {
      return new Response(JSON.stringify({ error: "Missing or invalid table/record_id/version_number" }), { status: 400 });
    }

    // Client acting AS the caller, so RLS tells us who they really are and what role they have
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
    }

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins may restore a version" }), { status: 403 });
    }

    // Service-role client to actually perform the restore (the SQL functions are security definer)
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

    return new Response(JSON.stringify({ restored: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});