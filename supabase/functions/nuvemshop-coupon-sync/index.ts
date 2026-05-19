import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { resolveNuvemshopConnection, nuvemshopApiBase, nuvemshopFetch, NUVEMSHOP_PAGE_SIZE } from "../_shared/nuvemshop-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cid = getCorrelationId(req);
  const log = createLogger("nuvemshop-coupon-sync", cid);

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { integrationId, action = "full-sync" } = await req.json();
    if (!integrationId) return new Response(JSON.stringify({ success: false, error: "integrationId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await requireResource(supabase, "integrations", integrationId, authTenantId, req);

    const conn = await resolveNuvemshopConnection(supabase, integrationId);
    if (!conn) return new Response(JSON.stringify({ success: false, error: "Conexão Nuvemshop não encontrada." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { connection, accessToken } = conn;
    const { data: intRow } = await supabase.from("integrations").select("tenant_id").eq("id", integrationId).single();
    const tenantId = intRow?.tenant_id;

    // Paginate through Nuvemshop coupons
    let allCoupons: Record<string, unknown>[] = [];
    let page = 1;

    while (true) {
      const url = `${nuvemshopApiBase(connection.store_id)}/coupons?page=${page}&per_page=${NUVEMSHOP_PAGE_SIZE}`;
      log.info(`[nuvemshop-coupon-sync] Fetching page=${page}`);

      const res = await nuvemshopFetch(url, accessToken);
      if (!res.ok) {
        const txt = await res.text();
        log.error(`[nuvemshop-coupon-sync] API error ${res.status}:`, txt);
        throw new Error(`Nuvemshop API error: ${res.status}`);
      }

      const coupons: Record<string, unknown>[] = await res.json();
      allCoupons = [...allCoupons, ...coupons];

      if (coupons.length < NUVEMSHOP_PAGE_SIZE) break;
      if (action === "check-new" && page >= 2) break;
      page++;
    }

    log.info(`[nuvemshop-coupon-sync] Fetched ${allCoupons.length} coupons`);

    const { data: existing } = await supabase.from("generated_coupons")
      .select("coupon_code, li_coupon_id, li_quantidade_usada")
      .eq("integration_id", integrationId);

    const existingMap = new Map((existing || []).map((c) => [c.coupon_code, c]));
    const existingByExtId = new Map((existing || []).filter((c) => c.li_coupon_id).map((c) => [String(c.li_coupon_id), c]));

    let upserted = 0;

    for (const c of allCoupons) {
      const code = String(c.code || "").toUpperCase();
      if (!code) continue;

      const tipo = c.type === "percentage" ? "porcentagem" : "valor_absoluto";
      const valorNum = parseFloat(String(c.value || "0"));
      const nsId = c.id as number | null;
      const dataInicial = c.start_date ? new Date(String(c.start_date)).toISOString() : null;
      const dataFinal = c.end_date ? new Date(String(c.end_date)).toISOString() : null;
      const usada = Number(c.used_times ?? 0);
      const maxUsos = c.max_uses != null ? Number(c.max_uses) : null;

      const alreadyByCode = existingMap.has(code);
      const alreadyById = nsId ? existingByExtId.has(String(nsId)) : false;

      if (alreadyByCode || alreadyById) {
        await supabase.from("generated_coupons")
          .update({ li_quantidade_usada: usada, li_data_fim: dataFinal, li_data_inicio: dataInicial })
          .eq("integration_id", integrationId)
          .eq("coupon_code", code);
      } else {
        await supabase.from("generated_coupons").insert({
          tenant_id: tenantId,
          integration_id: integrationId,
          coupon_code: code,
          discount_percentage: tipo === "porcentagem" ? valorNum : 0,
          coupon_value: tipo === "valor_absoluto" ? valorNum : null,
          li_coupon_id: nsId,
          source: "imported",
          coupon_type: tipo,
          coupon_description: String(c.description || ""),
          li_data_inicio: dataInicial,
          li_data_fim: dataFinal,
          li_quantidade_uso_maximo: maxUsos,
          li_quantidade_usada: usada,
          expires_at: dataFinal || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
        upserted++;
      }
    }

    log.info(`[nuvemshop-coupon-sync] Done — ${upserted} new, ${allCoupons.length - upserted} updated`);

    return new Response(
      JSON.stringify({ success: true, total: allCoupons.length, new: upserted, updated: allCoupons.length - upserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("[nuvemshop-coupon-sync] Error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
