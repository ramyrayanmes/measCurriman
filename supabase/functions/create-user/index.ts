// supabase/functions/create-user/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ROLES = [
  "admin", "teacher", "auditor", "head_department",
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
    const body = await req.json();
    const { email, full_name, role } = body;
    const resetUserId: string | undefined = body.action === "reset_password" ? body.user_id : undefined;
    const manageAction: string | undefined = ["set_active", "delete_user"].includes(body.action) ? body.action : undefined;

    if (manageAction && !body.user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: corsHeaders });
    }

    if (!resetUserId && !manageAction && (!email || !full_name || !VALID_ROLES.includes(role))) {
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

    if (manageAction) {
      const targetId: string = body.user_id;
      if (targetId === user.id) {
        return new Response(
          JSON.stringify({ error: "You cannot deactivate or delete your own account" }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (manageAction === "set_active") {
        const active = Boolean(body.active);
        // A ban stops sign-in and token refresh; the profile flag removes data access.
        const { error: banError } = await adminClient.auth.admin.updateUserById(
          targetId,
          { ban_duration: active ? "none" : "876000h" },
        );
        if (banError) throw banError;
        const { error: flagError } = await adminClient.from("profiles").update({ active }).eq("id", targetId);
        if (flagError) throw flagError;
        return new Response(JSON.stringify({ user_id: targetId, active }), { status: 200, headers: corsHeaders });
      }

      // delete_user: refuse when the person authored records that must be kept.
      const checks: [string, string, string][] = [
        ["curriculum_versions", "author_id", "saved curriculum versions"],
        ["official_versions", "set_by", "official-version changes"],
        ["version_comments", "author_id", "version comments"],
        ["weekly_plans", "teacher_id", "weekly plans"],
      ];
      for (const [table, column, label] of checks) {
        const { count, error: countError } = await adminClient
          .from(table).select("*", { count: "exact", head: true }).eq(column, targetId);
        if (countError) throw countError;
        if ((count ?? 0) > 0) {
          return new Response(
            JSON.stringify({
              error: `This user has ${count} ${label} that must be kept. Deactivate the account instead of deleting it.`,
            }),
            { status: 409, headers: corsHeaders }
          );
        }
      }

      // Deleting the auth user also removes the profile, working copies, assignments and notifications.
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetId);
      if (deleteError) throw deleteError;
      return new Response(JSON.stringify({ user_id: targetId, deleted: true }), { status: 200, headers: corsHeaders });
    }

    const tempPassword = generateTempPassword();

    if (resetUserId) {
      const { data: updated, error: resetError } = await adminClient.auth.admin.updateUserById(
        resetUserId,
        { password: tempPassword },
      );
      if (resetError) throw resetError;
      return new Response(
        JSON.stringify({ user_id: resetUserId, email: updated.user.email, temp_password: tempPassword }),
        { status: 200, headers: corsHeaders }
      );
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) throw createError;

    // Upsert so the profile exists even if the new-user trigger did not create it.
    const { error: profileUpsertError } = await adminClient
      .from("profiles")
      .upsert({ id: newUser.user.id, email, full_name, role }, { onConflict: "id" });
    if (profileUpsertError) throw profileUpsertError;

    return new Response(
      JSON.stringify({ user_id: newUser.user.id, email, temp_password: tempPassword }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
