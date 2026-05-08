import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("delete-account", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Parse mode from body (default: full delete for backward compat)
    let mode = "delete_owned_account";
    try {
      const body = await req.json();
      if (body?.mode === "leave_teams") mode = "leave_teams";
    } catch {
      // No body or invalid JSON — default mode
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (mode === "leave_teams") {
      const { data, error: rpcError } = await supabaseAdmin.rpc("leave_team_memberships", {
        _user_id: userId,
      });

      if (rpcError) {
        log.error("Error in leave_team_memberships RPC:", rpcError);
        return new Response(JSON.stringify({
          error: "Failed to leave teams",
          details: rpcError.message,
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        mode: "leave_teams",
        message: "Left all teams successfully",
        logs: data?.logs ?? [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Owner flow: delete everything + auth user
    const { data, error: rpcError } = await supabaseAdmin.rpc("delete_account_data", {
      _user_id: userId,
    });

    if (rpcError) {
      log.error("Error in delete_account_data RPC:", rpcError);
      return new Response(JSON.stringify({
        error: "Failed to delete account data",
        details: rpcError.message,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const logs: string[] = data?.logs ?? [];

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      log.error("Error deleting auth user:", deleteAuthError);
      return new Response(JSON.stringify({
        error: "Data deleted but failed to remove auth user",
        details: deleteAuthError.message,
        logs,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logs.push("Conta de autenticação removida");
    logs.push("✅ Conta excluída com sucesso!");

    return new Response(JSON.stringify({
      success: true,
      mode: "delete_owned_account",
      message: "Account deleted successfully",
      logs,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    log.error("Error in delete-account:", err);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: err instanceof Error ? err.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
