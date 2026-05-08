import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { invite_token } = await req.json();

    if (!invite_token) {
      return new Response(
        JSON.stringify({ valid: false, error: "Token obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Lookup by hash — never store or compare plaintext
    const tokenHash = await sha256Hex(invite_token);

    const { data: invite } = await supabaseAdmin
      .from("team_invites")
      .select("id, tenant_id, email, role, status, expires_at")
      .eq("invite_token_hash", tokenHash)
      .maybeSingle();

    if (!invite) {
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.status !== "pending") {
      return new Response(
        JSON.stringify({ valid: false, used: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabaseAdmin
        .from("team_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({ valid: false, expired: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .eq("id", invite.tenant_id)
      .single();

    return new Response(
      JSON.stringify({
        valid: true,
        email: invite.email,
        role: invite.role,
        tenant_name: tenant?.name || "Equipe",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ valid: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
