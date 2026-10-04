import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { LI_API_BASE, liCouponToRow, type LiCoupon } from "../_shared/li-coupons.ts";

const PAGE = 100;
const BUDGET_MS = 110_000; // o runtime dá ~150 s

type Prev = { source: string | null; used_at: string | null };

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("li-coupon-sync", getCorrelationId(req));
  const started = Date.now();

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { integrationId, action = "full-sync" } = await req.json();
    if (!integrationId) return json({ success: false, error: "integrationId is required" }, 400);

    const integration = await requireResource<{ id: string; tenant_id: string; api_key: string }>(supabase, "integrations", integrationId, authTenantId, req, "id, api_key, tenant_id");
    const authHeader = liAuthHeader(integration.api_key);
    const ctx = { tenantId: integration.tenant_id, integrationId };

    const { data: syncLog } = await supabase.from("li_sync_logs").insert({ tenant_id: ctx.tenantId, integration_id: integrationId, sync_type: "coupons", status: "running", started_at: new Date().toISOString() }).select().single();

    // origem e data de uso já gravadas (coupon criado pelo sistema mantém a origem), lidas em páginas
    const prev = new Map<string, Prev>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("generated_coupons").select("coupon_code, source, used_at").eq("integration_id", integrationId).range(from, from + 999);
      for (const r of data ?? []) prev.set(r.coupon_code as string, { source: r.source as string | null, used_at: r.used_at as string | null });
      if (!data || data.length < 1000) break;
    }

    let fetched = 0, total = 0, saved = 0, partial = false;
    const errors: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      if (Date.now() - started > BUDGET_MS) { partial = true; break; }
      const res = await fetch(`${LI_API_BASE}/cupom?limit=${PAGE}&offset=${offset}`, { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`A Loja Integrada respondeu ${res.status} ao listar cupons`);
      const page = await res.json();
      const coupons = (page.objects ?? []) as LiCoupon[];
      total = page.meta?.total_count ?? total;
      fetched += coupons.length;

      // um upsert por página (a unicidade é integração + código)
      const rows = coupons.map((c) => liCouponToRow(c, ctx, prev.get(c.codigo)));
      if (rows.length) {
        const { error } = await supabase.from("generated_coupons").upsert(rows, { onConflict: "integration_id,coupon_code" });
        if (error) errors.push(`offset ${offset}: ${error.message}`); else saved += rows.length;
      }
      if (coupons.length < PAGE || (total && offset + PAGE >= total)) break;
      if (action === "check-new" && offset >= 200) break; // só os primeiros
    }

    if (syncLog?.id) {
      await supabase.from("li_sync_logs").update({
        status: errors.length ? "completed_with_errors" : "completed", records_synced: saved,
        completed_at: new Date().toISOString(), error_message: errors.length ? errors.join("; ").slice(0, 900) : null,
      }).eq("id", syncLog.id);
    }
    log.info(`[COUPON-SYNC] ${saved}/${total} salvos${partial ? " (parcial: tempo esgotado)" : ""}, ${errors.length} erros`);
    return json({ success: true, synced: saved, totalFetched: fetched, totalInApi: total, partial, errors: errors.length ? errors : undefined, syncLogId: syncLog?.id });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    log.error("[COUPON-SYNC]", message);
    return json({ success: false, error: message }, 500);
  }
});
