import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { loadGa4Config, runGa4Report } from "../_shared/ga4-api.ts";

/**
 * ga4-monthly — usuário autenticado. Devolve, mês a mês (12 meses), a receita de compra e o reembolso que o GA4 registrou,
 * para conciliar com o CRM e com o Google Ads. Só lê; só responde para a loja dona da propriedade GA4.
 */
serve(async (req) => {
  const log = createLogger("ga4-monthly", getCorrelationId(req));
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUserAuth(req);
    const cfg = loadGa4Config();
    if (!cfg || auth.tenantId !== cfg.tenantId) return json({ configured: false, months: [] });

    const report = await runGa4Report(cfg, {
      dateRanges: [{ startDate: "365daysAgo", endDate: "today" }],
      dimensions: [{ name: "yearMonth" }],
      metrics: [{ name: "purchaseRevenue" }, { name: "refundAmount" }, { name: "ecommercePurchases" }],
      orderBys: [{ dimension: { dimensionName: "yearMonth" } }],
    });
    const months = (report.rows ?? []).map((r) => ({
      month: `${r.dimensionValues[0].value.slice(0, 4)}-${r.dimensionValues[0].value.slice(4, 6)}-01`,
      purchase_revenue: Number(r.metricValues[0].value), refund_amount: Number(r.metricValues[1].value), purchases: Number(r.metricValues[2].value),
    }));
    return json({ configured: true, months });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em ga4-monthly", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
