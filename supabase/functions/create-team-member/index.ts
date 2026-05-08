import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { PRIMARY_FRONTEND_URL } from "../_shared/frontend-config.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("create-team-member", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, tenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { email, tenant_id, role, permissions } = await req.json();

    if (!email || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "Email e tenant_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    assertTenantMatch(tenantId, tenant_id, req);

    // Verify caller is admin
    const { data: isAdmin } = await supabaseAdmin.rpc("is_tenant_admin", {
      _user_id: userId,
      _tenant_id: tenant_id,
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem convidar membros" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already has a pending invite
    const { data: existingInvite } = await supabaseAdmin
      .from("team_invites")
      .select("id, status")
      .eq("tenant_id", tenant_id)
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      return new Response(
        JSON.stringify({ error: "Já existe um convite pendente para este email" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists (targeted lookup, not listUsers)
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({
      filter: `email.eq.${normalizedEmail}`,
      page: 1,
      perPage: 1,
    });

    const targetUser = existingUsers?.users?.[0];

    if (targetUser) {
      const { data: existingMember } = await supabaseAdmin
        .from("team_members")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("user_id", targetUser.id)
        .maybeSingle();

      if (existingMember) {
        return new Response(
          JSON.stringify({ error: "Este email já é membro desta equipe" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check token balance (10 tokens per member)
    const TEAM_MEMBER_COST = 10;
    const { data: hasTokens } = await supabaseAdmin.rpc("has_enough_tokens", {
      _tenant_id: tenant_id,
      _amount: TEAM_MEMBER_COST,
    });

    if (!hasTokens) {
      return new Response(
        JSON.stringify({ error: "Tokens insuficientes. Adicionar um membro custa 10 tokens." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct tokens BEFORE creating invite (transactional: fail = no invite)
    const { data: deducted } = await supabaseAdmin.rpc("deduct_tokens", {
      _tenant_id: tenant_id,
      _amount: TEAM_MEMBER_COST,
      _type: "team_invite",
      _description: `Convite enviado para: ${normalizedEmail}`,
    });

    if (!deducted) {
      return new Response(
        JSON.stringify({ error: "Falha ao cobrar tokens. Convite não criado." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate secure invite token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const inviteToken = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Store only the hash
    const tokenHash = await sha256Hex(inviteToken);

    // Create invite record — store hash, clear plaintext
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("team_invites")
      .insert({
        tenant_id,
        email: normalizedEmail,
        role: role || "member",
        permissions: permissions || [],
        invite_token: "", // no plaintext stored
        invite_token_hash: tokenHash,
        invited_by: userId,
      })
      .select("id, expires_at")
      .single();

    if (inviteError) {
      // Rollback: refund tokens
      await supabaseAdmin.rpc("add_tokens", {
        _tenant_id: tenant_id,
        _amount: TEAM_MEMBER_COST,
        _type: "team_invite_refund",
        _description: `Reembolso - falha ao criar convite para: ${normalizedEmail}`,
      });

      return new Response(
        JSON.stringify({ error: `Erro ao criar convite: ${inviteError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build invite URL server-side — token only appears here, never stored
    const origin = req.headers.get("Origin") || PRIMARY_FRONTEND_URL;
    const inviteUrl = `${origin}/invite?token=${inviteToken}`;

    return new Response(
      JSON.stringify({
        success: true,
        invite_id: invite.id,
        invite_url: inviteUrl,
        expires_at: invite.expires_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("[CREATE-TEAM-MEMBER] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
