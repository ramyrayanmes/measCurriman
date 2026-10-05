// supabase/functions/create-user/index.ts
//
// POST body: { "email": "...", "full_name": "...", "role": "teacher" | "auditor" | "admin" }
// Only admins may call this. Generates a random temporary password and
// returns it in the response — the admin shares it with the new user, who
// changes it themselves on first login (same flow as the manual dashboard
// process, just without needing dashboard access).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    if (!email || !full_name || !["admin", "teacher", "auditor"].includes(role)) {
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

    // The handle_new_user trigger already created a profiles row defaulted to
    // 'teacher' — update it to the role the admin actually chose.
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
