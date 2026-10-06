// supabase/functions/create-user/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ROLES = [
  "admin", "teacher", "auditor",
  "head_kindergarten", "head_elementary", "head_middle", "head_high",
];

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pwd = "";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (const b of bytes) pwd += chars[b % chars.length];
  return pwd;
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
    const { email, full_name, role } = await req.json();

    if (!email || !full_name || !VALID_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid email/full_name/role" }),
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

    if (profileError || profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins may create users" }), { status: 403, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const tempPassword = generateTempPassword();

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) throw createError;

    if (role !== "teacher") {
      const { error: roleError } = await adminClient
        .from("profiles")
        .update({ role })
        .eq("id", newUser.user.id);
      if (roleError) throw roleError;
    }

    return new Response(
      JSON.stringify({ user_id: newUser.user.id, email, temp_password: tempPassword }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
