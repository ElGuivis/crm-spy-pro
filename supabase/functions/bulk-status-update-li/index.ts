import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LI_API_BASE = "https://api.awsli.com.br/v1";

const ORDERS_PER_INVOCATION = 30;
const BATCH_SIZE = 3;
const THROTTLE_MS = 5000;
const MAX_RETRIES = 3;
const RATE_LIMIT_PAUSE_MS = 60000;

const statusMap: Record<string, { codigo: string; status_name: string }> = {
  delivered: { codigo: "pedido_entregue", status_name: "Pedido Entregue" },
  posted:    { codigo: "pedido_enviado",  status_name: "Pedido Enviado"  },
};

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status === 429 && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_PAUSE_MS));
      continue;
    }
    return resp;
  }
  return await fetch(url, options);
}

async function processPair(
  supabase: ServiceClient,
  me_integration_id: string,
  liIntegration: { id: string; api_key: string; tenant_id: string },
  target_status: string,
  limit: number,
  dry_run: boolean,
  log: ReturnType<typeof createLogger>
) {
  const appKey = Deno.env.get("LOJA_INTEGRADA_APP_KEY");
  if (!appKey) throw new Error("LOJA_INTEGRADA_APP_KEY not configured");

  const mapping = statusMap[target_status];
  if (!mapping) throw new Error(`Invalid target_status: ${target_status}`);

  const authHeaderLI = `chave_api ${liIntegration.api_key} aplicacao ${appKey}`;
  const effectiveLimit = Math.min(Number(limit) || ORDERS_PER_INVOCATION, 100);
  const allLiOrders: Record<string, unknown>[] = [];
  let offset = 0;
  const PAGE_SIZE = 500;
  const IN_CHUNK_SIZE = 50;

  while (allLiOrders.length < effectiveLimit) {
    const { data: shipmentBatch } = await supabase
      .from("me_shipments")
      .select("li_order_id")
      .eq("integration_id", me_integration_id)
      .eq("status", target_status)
      .not("li_order_id", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (!shipmentBatch || shipmentBatch.length === 0) break;

    const ids = [...new Set(shipmentBatch.map((s: Record<string, unknown>) => s.li_order_id))] as string[];

    for (let c = 0; c < ids.length && allLiOrders.length < effectiveLimit; c += IN_CHUNK_SIZE) {
      const idChunk = ids.slice(c, c + IN_CHUNK_SIZE);
      const { data: liChunk } = await supabase
        .from("li_orders")
        .select("id, order_number, status_name, loja_integrada_order_id")
        .in("id", idChunk)
        .neq("status_name", mapping.status_name);

      if (liChunk) allLiOrders.push(...liChunk);
    }

    if (shipmentBatch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const seenIds = new Set<string>();
  const liOrders = allLiOrders.filter((o) => {
    if (seenIds.has(o.id as string)) return false;
    seenIds.add(o.id as string);
    return true;
  }).slice(0, effectiveLimit);

  if (liOrders.length === 0) return { updated: 0, failed: 0, rate_limited: 0, errors: [] };

  if (dry_run) {
    return { dry_run: true, would_update: liOrders.length, sample: liOrders.slice(0, 3) };
  }

  let updated = 0, failed = 0, rateLimited = 0;
  const errors: string[] = [];

  for (let i = 0; i < liOrders.length; i += BATCH_SIZE) {
    const batch = liOrders.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (order: Record<string, unknown>) => {
        const orderNum = order.order_number;
        if (!orderNum) return { success: false, error: "no order_number" };

        const resp = await fetchWithRetry(`${LI_API_BASE}/situacao/pedido/${orderNum}/`, {
          method: "PUT",
          headers: { Authorization: authHeaderLI, "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: mapping.codigo }),
        });

        const respText = await resp.text().catch(() => "");
        log.info(`[bulk-status-update] tenant=${liIntegration.tenant_id} order=${orderNum} HTTP=${resp.status}`);

        if (!resp.ok) {
          if (resp.status === 429) rateLimited++;
          return { success: false, error: `HTTP ${resp.status}: ${respText.substring(0, 100)}`, order_number: orderNum };
        }

        await supabase
          .from("li_orders")
          .update({ updated_at_local: new Date().toISOString() })
          .eq("id", order.id);

        return { success: true };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && (r.value as Record<string, unknown>).success) {
        updated++;
      } else {
        failed++;
        const errMsg = r.status === "rejected" ? r.reason?.message : (r.value as Record<string, unknown>)?.error;
        if (errMsg && errors.length < 10) errors.push(String(errMsg));
      }
    }

    if (i + BATCH_SIZE < liOrders.length) {
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
    }
  }

  return { updated, failed, rate_limited: rateLimited, errors };
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("bulk-status-update-li", cid);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const {
      me_integration_id,
      store_integration_id,
      target_status = "delivered",
      dry_run = false,
      limit = ORDERS_PER_INVOCATION,
    } = body;

    const mapping = statusMap[target_status];
    if (!mapping) {
      return new Response(
        JSON.stringify({ error: `Invalid target_status: ${target_status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single-pair mode (backwards compatible)
    if (me_integration_id && store_integration_id) {
      const { data: liIntegration } = await supabase
        .from("integrations")
        .select("id, api_key, tenant_id")
        .eq("id", store_integration_id)
        .eq("type", "loja_integrada")
        .single();

      if (!liIntegration?.api_key) {
        return new Response(
          JSON.stringify({ error: "LI integration not found or missing api_key" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await processPair(supabase, me_integration_id, liIntegration, target_status, limit, dry_run, log);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Multi-tenant mode: fetch all active ME+LI pairs automatically
    const { data: meTokens } = await supabase
      .from("melhor_envio_tokens")
      .select("id, tenant_id")
      .eq("environment", "production");

    if (!meTokens || meTokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active Melhor Envio integrations found", processed_tenants: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantIds = meTokens.map((t: Record<string, unknown>) => t.tenant_id as string);

    const { data: liIntegrations } = await supabase
      .from("integrations")
      .select("id, api_key, tenant_id")
      .eq("type", "loja_integrada")
      .eq("status", "connected")
      .in("tenant_id", tenantIds);

    if (!liIntegrations || liIntegrations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active LI integrations found for tenants with ME", processed_tenants: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build a map tenant_id → li_integration for quick lookup
    const liByTenant = Object.fromEntries(
      liIntegrations.map((li: Record<string, unknown>) => [li.tenant_id as string, li])
    );

    const summary: Record<string, unknown>[] = [];

    for (const me of meTokens) {
      const li = liByTenant[me.tenant_id as string];
      if (!li) {
        log.info(`[bulk-status-update] tenant=${me.tenant_id} has ME but no connected LI — skipping`);
        continue;
      }

      try {
        const result = await processPair(
          supabase,
          me.id as string,
          li as { id: string; api_key: string; tenant_id: string },
          target_status,
          limit,
          dry_run,
          log
        );
        summary.push({ tenant_id: me.tenant_id, ...result });
        log.info(`[bulk-status-update] tenant=${me.tenant_id} done: ${JSON.stringify(result)}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`[bulk-status-update] tenant=${me.tenant_id} error: ${msg}`);
        summary.push({ tenant_id: me.tenant_id, error: msg });
      }
    }

    const totals = summary.reduce(
      (acc, r) => ({
        updated: acc.updated + ((r.updated as number) || 0),
        failed: acc.failed + ((r.failed as number) || 0),
      }),
      { updated: 0, failed: 0 }
    );

    return new Response(
      JSON.stringify({ processed_tenants: summary.length, ...totals, tenants: summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("[bulk-status-update] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
