import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { proposeConversionFixes, proposeNegatives } from "../_shared/google-ads-build-runner.ts";
import { runInsights } from "../_shared/google-ads-insights-runner.ts";

/**
 * google-ads-insights — HYBRID. Roda o motor de descobertas (regras, sem IA) sobre os dados detalhados ja sincronizados.
 *  - Usuario (JWT, admin do tenant): uma conta do PROPRIO tenant (account_id obrigatorio).
 *  - Interno (cron / service_role): todas as contas ativas, ou so a de account_id.
 * Somente leitura no Google Ads: grava o relatorio em google_ads_recommendations.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-insights", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUserOrInternalAuth(req);
    const body = await req.json().catch(() => ({}));
    const accountId = typeof body.account_id === "string" ? body.account_id : undefined;
    if (accountId && !UUID_RE.test(accountId)) return json({ error: "account_id invalido" }, 400);
    if (!auth.isInternal && !accountId) return json({ error: "account_id obrigatorio" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let q = supabase.from("google_ads_accounts").select("id").neq("status", "paused");
    if (!auth.isInternal) {
      const { data: isAdmin } = await supabase.rpc("is_tenant_admin", { _user_id: auth.userId, _tenant_id: auth.tenantId });
      if (!isAdmin) return json({ error: "Somente administradores" }, 403);
      q = q.eq("tenant_id", auth.tenantId!);
    }
    if (accountId) q = q.eq("id", accountId);
    const { data: accounts, error } = await q;
    if (error) throw new Error(error.message);
    if (!accounts?.length) return json({ results: [] });

    const actor = auth.isInternal ? "system" : `user:${auth.userId}`;
    const results = [];
    for (const a of accounts) {
      const r = await runInsights(supabase, a.id, actor);
      if (!r.ok) log.warn("descobertas falharam", { account_id: a.id, error: r.error });
      else {
        const n = await proposeNegatives(supabase, a.id);
        if (!n.ok) log.warn("propostas de negativas falharam", { account_id: a.id, error: n.error });
        const cv = await proposeConversionFixes(supabase, a.id);
        if (!cv.ok) log.warn("propostas de conversao falharam", { account_id: a.id, error: cv.error });
      }
      results.push({ account_id: r.account_id, ok: r.ok, error: r.error, findings: r.report?.findings.length });
    }
    return json({ results }, results.every((r) => r.ok) ? 200 : 500);
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-insights", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
