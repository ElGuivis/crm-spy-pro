import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("accept-team-invite", cid);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { invite_token, password } = await req.json();

    if (!invite_token || !password) {
      return new Response(
        JSON.stringify({ error: "Token e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter no mínimo 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Lookup by hash
    const tokenHash = await sha256Hex(invite_token);

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("team_invites")
      .select("id, tenant_id, email, role, permissions, status, expires_at")
      .eq("invite_token_hash", tokenHash)
      .maybeSingle();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Convite não encontrado ou inválido" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Este convite já foi utilizado ou revogado" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabaseAdmin
        .from("team_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({ error: "Este convite expirou. Solicite um novo convite ao administrador." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get tenant name for context
    const { data: tenantData } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .eq("id", invite.tenant_id)
      .single();

    // Check if user already exists (targeted lookup, not listUsers)
    const normalizedEmail = invite.email.toLowerCase().trim();
    // Note: auth.admin.listUsers() does not support filtering by email in its typed
    // signature. Page through results and match locally to avoid TS errors and to
    // remain forward-compatible with SDK changes.
    const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const existingUser = usersPage?.users?.find(
      (u) => (u.email || "").toLowerCase().trim() === normalizedEmail
    );
    let userId: string;

    if (existingUser) {
      // User exists - just add to team
      userId = existingUser.id;

      // Check if already a member
      const { data: existingMember } = await supabaseAdmin
        .from("team_members")
        .select("id")
        .eq("tenant_id", invite.tenant_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingMember) {
        // Mark invite as accepted
        await supabaseAdmin
          .from("team_invites")
          .update({ status: "accepted", accepted_at: new Date().toISOString() })
          .eq("id", invite.id);

        return new Response(
          JSON.stringify({ success: true, already_member: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create new user - they define their own password
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { is_team_member: true },
      });

      if (createError) {
        return new Response(
          JSON.stringify({ error: `Erro ao criar conta: ${createError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;
    }

    // Create team membership
    const { data: teamMember, error: memberError } = await supabaseAdmin
      .from("team_members")
      .insert({
        tenant_id: invite.tenant_id,
        user_id: userId,
        role: invite.role || "member",
      })
      .select("id")
      .single();

    if (memberError) {
      // If user was just created, clean up
      if (!existingUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(
        JSON.stringify({ error: `Erro ao criar membro: ${memberError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add permissions if role is member
    const permissions = invite.permissions as Array<{
      permission: string;
      can_view: boolean;
      can_edit: boolean;
    }> | null;

    if (invite.role === "member" && permissions && permissions.length > 0) {
      const permissionsToInsert = permissions.map((p) => ({
        team_member_id: teamMember.id,
        permission: p.permission,
        can_view: p.can_view,
        can_edit: p.can_edit,
      }));

      const { error: permError } = await supabaseAdmin
        .from("member_permissions")
        .insert(permissionsToInsert);

      if (permError) {
        // Rollback: remove team member and user if new
        await supabaseAdmin.from("team_members").delete().eq("id", teamMember.id);
        if (!existingUser) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
        }
        return new Response(
          JSON.stringify({ error: `Erro ao configurar permissões: ${permError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Mark invite as accepted
    await supabaseAdmin
      .from("team_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({
        success: true,
        tenant_name: tenantData?.name || "Equipe",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("[ACCEPT-TEAM-INVITE] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
