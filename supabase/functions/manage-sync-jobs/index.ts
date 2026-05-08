import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

/**
 * manage-sync-jobs — Server-side management for sync job lifecycle.
 *
 * Moves cancel/reset/force-reset operations from browser to server,
 * ensuring tenant isolation and role validation.
 *
 * Actions:
 *   - cancel-me:    Cancel active Melhor Envio sync jobs
 *   - reset-me:     Force-reset all pending/running ME jobs
 *   - cancel-bling: Cancel active Bling sync jobs
 *   - delete-integration: Delete an integration with tenant check
 */

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("manage-sync-jobs", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { userId, tenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action } = body;
    const now = new Date().toISOString();

    // ── Helper: require admin role ──────────────────────────────────────────
    const requireAdmin = async () => {
      const { data: isAdmin } = await supabase.rpc("is_tenant_admin", {
        _user_id: userId,
        _tenant_id: tenantId,
      });
      if (!isAdmin) {
        throw json({ error: "Apenas administradores podem executar esta ação" }, 403);
      }
    };

    // =========================================================================
    // ACTION: cancel-me — Cancel a specific ME sync job (admin only)
    // =========================================================================
    if (action === "cancel-me") {
      await requireAdmin();
      const { job_id } = body;
      if (!job_id) return json({ error: "job_id é obrigatório" }, 400);

      // Verify job belongs to tenant via requireResource (IDOR protection)
      await requireResource(supabase, "me_sync_jobs", job_id, tenantId, req);

      const { error } = await supabase
        .from("me_sync_jobs")
        .update({
          status: "failed",
          error_message: "Cancelado pelo usuário",
          completed_at: now,
          updated_at: now,
        })
        .eq("id", job_id)
        .eq("tenant_id", tenantId);

      if (error) throw error;
      return json({ success: true });
    }

    // =========================================================================
    // ACTION: reset-me — Force-reset all pending/running ME jobs (admin only)
    // =========================================================================
    if (action === "reset-me") {
      await requireAdmin();
      const { error } = await supabase
        .from("me_sync_jobs")
        .update({
          status: "failed",
          error_message: "Reset forçado pelo usuário",
          completed_at: now,
          updated_at: now,
        })
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "running"]);

      if (error) throw error;
      return json({ success: true });
    }

    // =========================================================================
    // ACTION: cancel-bling — Cancel all pending/running Bling sync jobs (admin only)
    // =========================================================================
    if (action === "cancel-bling") {
      await requireAdmin();
      const { integration_id, sync_log_id } = body;
      if (!integration_id) return json({ error: "integration_id é obrigatório" }, 400);

      // Verify integration belongs to tenant via requireResource (IDOR protection)
      await requireResource(supabase, "integrations", integration_id, tenantId, req);

      const { error } = await supabase
        .from("bling_sync_jobs")
        .update({
          status: "cancelled",
          error_message: "Cancelado pelo usuário",
          completed_at: now,
          updated_at: now,
        })
        .eq("integration_id", integration_id)
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "running"]);

      if (error) throw error;

      // Also update sync log if provided
      if (sync_log_id) {
        await supabase
          .from("bling_sync_logs")
          .update({
            status: "cancelled",
            error_message: "Cancelado pelo usuário",
            completed_at: now,
          })
          .eq("id", sync_log_id)
          .eq("tenant_id", tenantId);
      }

      return json({ success: true });
    }

    // =========================================================================
    // ACTION: delete-integration — Remove an integration with tenant check
    // =========================================================================
    if (action === "delete-integration") {
      await requireAdmin();
      const { integration_id } = body;
      if (!integration_id) return json({ error: "integration_id é obrigatório" }, 400);

      // Verify integration belongs to tenant via requireResource (IDOR protection)
      await requireResource(supabase, "integrations", integration_id, tenantId, req);

      // Cascade delete via SQL function (handles all 38 FK-dependent tables)
      const { error } = await supabase.rpc("delete_integration_cascade", {
        p_integration_id: integration_id,
        p_tenant_id: tenantId,
      });

      if (error) throw new Error(error.message);
      return json({ success: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("[manage-sync-jobs] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...getRestrictedCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
