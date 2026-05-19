import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { BLING_API_BASE, RATE_LIMIT_DELAY } from "../_shared/bling-sync-helpers.ts";
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cid = getCorrelationId(req);
  const log = createLogger("bling-coupon-sync", cid);

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { integrationId, action = "full-sync" } = await req.json();
    if (!integrationId) return new Response(JSON.stringify({ success: false, error: "integrationId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const integration = await requireResource<{ id: string; tenant_id: string; metadata: Record<string, unknown> }>(
      supabase, "integrations", integrationId, authTenantId, req, "id, tenant_id, metadata",
    );

    const connectionId = (integration.metadata as Record<string, unknown>)?.bling_connection_id as string | undefined;
    if (!connectionId) return new Response(JSON.stringify({ success: false, error: "Conexão Bling não encontrada." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: conn } = await supabase.from("bling_connections")
      .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("id", connectionId).single();
    if (!conn) return new Response(JSON.stringify({ success: false, error: "Conexão Bling não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const accessToken = await ensureBlingToken(supabase, conn, "[bling-coupon-sync]");
    const tenantId = integration.tenant_id;

    // Paginate through Bling coupons
    let allCoupons: Record<string, unknown>[] = [];
    let page = 1;
    const limite = 100;

    while (true) {
      log.info(`[bling-coupon-sync] Fetching page=${page}`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY));

      const res = await fetch(`${BLING_API_BASE}/cupons-desconto?pagina=${page}&limite=${limite}`, {
        headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" },
      });

      if (!res.ok) {
        const txt = await res.text();
        log.error(`[bling-coupon-sync] API error ${res.status}:`, txt);
        throw new Error(`Bling API error: ${res.status}`);
      }

      const json = await res.json();
      const coupons: Record<string, unknown>[] = json?.data || [];
      allCoupons = [...allCoupons, ...coupons];

      if (coupons.length < limite) break;
      if (action === "check-new" && page >= 2) break;
      page++;
    }

    log.info(`[bling-coupon-sync] Fetched ${allCoupons.length} coupons`);

    // Load existing coupon codes to deduplicate
    const { data: existing } = await supabase.from("generated_coupons")
      .select("coupon_code, li_coupon_id, li_quantidade_usada")
      .eq("integration_id", integrationId);

    const existingMap = new Map((existing || []).map((c) => [c.coupon_code, c]));
    const existingByExtId = new Map((existing || []).filter((c) => c.li_coupon_id).map((c) => [String(c.li_coupon_id), c]));

    let upserted = 0;

    for (const c of allCoupons) {
      const code = String(c.codigo || "").toUpperCase();
      if (!code) continue;

      const desconto = c.desconto as Record<string, unknown> | undefined;
      const tipoDesc = desconto?.tipo as number | undefined; // 1=fixo, 2=%
      const valorDesc = Number(desconto?.valor ?? 0);
      const tipo = tipoDesc === 1 ? "valor_absoluto" : "porcentagem";
      const blingId = c.id as number | null;
      const dataInicial = c.dataInicial ? new Date(String(c.dataInicial)).toISOString() : null;
      const dataFinal = c.dataFinal ? new Date(String(c.dataFinal)).toISOString() : null;
      const usada = Number(c.quantidadeUsos ?? 0);
      const maxUsos = c.limiteUso != null ? Number(c.limiteUso) : null;

      const alreadyByCode = existingMap.has(code);
      const alreadyById = blingId ? existingByExtId.has(String(blingId)) : false;

      if (alreadyByCode || alreadyById) {
        // Update usage count and dates
        await supabase.from("generated_coupons")
          .update({ li_quantidade_usada: usada, li_data_fim: dataFinal, li_data_inicio: dataInicial })
          .eq("integration_id", integrationId)
          .eq("coupon_code", code);
      } else {
        await supabase.from("generated_coupons").insert({
          tenant_id: tenantId,
          integration_id: integrationId,
          coupon_code: code,
          discount_percentage: tipo === "porcentagem" ? valorDesc : 0,
          coupon_value: tipo === "valor_absoluto" ? valorDesc : null,
          li_coupon_id: blingId,
          source: "imported",
          coupon_type: tipo,
          coupon_description: String(c.descricao || ""),
          li_data_inicio: dataInicial,
          li_data_fim: dataFinal,
          li_quantidade_uso_maximo: maxUsos,
          li_quantidade_usada: usada,
          expires_at: dataFinal || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
        upserted++;
      }
    }

    log.info(`[bling-coupon-sync] Done — ${upserted} new, ${allCoupons.length - upserted} updated`);

    return new Response(
      JSON.stringify({ success: true, total: allCoupons.length, new: upserted, updated: allCoupons.length - upserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("[bling-coupon-sync] Error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
