import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

// Use direct DB connection so the cascade delete (which traverses 70+ FK tables
// containing hundreds of thousands of rows for a real tenant) is not killed by
// PostgREST's 8s statement_timeout.
async function callViaDirectDb(rpcName: string, userId: string): Promise<{ logs: string[] }> {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) throw new Error("SUPABASE_DB_URL not set");

  const dbClient = new Client(dbUrl);
  await dbClient.connect();
  try {
    await dbClient.queryArray("BEGIN");
    await dbClient.queryArray("SET LOCAL statement_timeout = 0");
    const result = await dbClient.queryObject<{ result: { logs?: string[] } }>(
      `SELECT public.${rpcName}($1::uuid) AS result`,
      [userId],
    );
    await dbClient.queryArray("COMMIT");
    return { logs: result.rows[0]?.result?.logs ?? [] };
  } catch (err) {
    await dbClient.queryArray("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await dbClient.end();
  }
}

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
      try {
        const { logs } = await callViaDirectDb("leave_team_memberships", userId);
        return new Response(JSON.stringify({
          success: true,
          mode: "leave_teams",
          message: "Left all teams successfully",
          logs,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        log.error("Error in leave_team_memberships:", err);
        return new Response(JSON.stringify({
          error: "Failed to leave teams",
          details: err instanceof Error ? err.message : String(err),
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Owner flow: delete everything + auth user
    let logs: string[];
    try {
      ({ logs } = await callViaDirectDb("delete_account_data", userId));
    } catch (err) {
      log.error("Error in delete_account_data:", err);
      return new Response(JSON.stringify({
        error: "Failed to delete account data",
        details: err instanceof Error ? err.message : String(err),
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
