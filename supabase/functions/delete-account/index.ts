import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

type Logger = ReturnType<typeof createLogger>;
type SupabaseAdmin = ReturnType<typeof createClient>;

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

// Heavy cascade + auth user deletion. Runs in EdgeRuntime.waitUntil so the
// HTTP response can return immediately — for a real tenant the cascade alone
// can exceed the 150s edge function wall time, which would surface to the
// frontend as a non-2xx and leave the user thinking nothing happened.
async function runFullDeletion(userId: string, supabaseAdmin: SupabaseAdmin, log: Logger): Promise<void> {
  try {
    const { logs } = await callViaDirectDb("delete_account_data", userId);
    log.info("[DELETE-ACCOUNT] Data cascade complete", logs);

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      log.error("[DELETE-ACCOUNT] Failed to delete auth user after data cascade:", deleteAuthError.message);
      return;
    }

    log.info("[DELETE-ACCOUNT] Auth user removed; account fully deleted");
  } catch (err) {
    log.error("[DELETE-ACCOUNT] Background error:", err instanceof Error ? err.message : err);
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
      // Fast — keep synchronous so frontend gets logs.
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

    // Owner flow: data cascade can dwarf the 150s edge runtime budget. Dispatch
    // to background so the HTTP response is immediate; the user gets logged out
    // by the frontend right away while the cascade + auth.admin.deleteUser run
    // server-side. Even if the user reopens the app, they have no profile/auth
    // to log into anymore once the background work finishes (seconds to minutes
    // depending on tenant size).
    EdgeRuntime.waitUntil(runFullDeletion(userId, supabaseAdmin, log));

    return new Response(JSON.stringify({
      success: true,
      mode: "delete_owned_account",
      message: "Exclusão iniciada — você será deslogado e a remoção continua em segundo plano",
      logs: [
        "Iniciando exclusão...",
        "A exclusão está rodando no servidor. Pode levar alguns minutos para grandes volumes.",
        "Você será deslogado agora.",
      ],
    }), {
      status: 202,
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
