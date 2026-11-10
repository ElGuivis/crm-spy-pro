import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { evaluateOutcomes } from "../_shared/google-ads-outcome-runner.ts";

/**
 * google-ads-outcomes — HYBRID. Mede o resultado (7 e 14 dias depois) das mudancas aplicadas no Google Ads.
 *  - Usuario admin: uma conta do PROPRIO tenant (account_id obrigatorio).
 *  - Interno (cron): todas as contas ativas, ou so a de account_id.
 * Somente leitura do banco; grava em google_ads_action_outcomes.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-outcomes", cid);
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

    const results = [];
    for (const a of accounts ?? []) {
      const r = await evaluateOutcomes(supabase, a.id);
      if (!r.ok) log.warn("avaliacao de resultados falhou", { account_id: a.id, error: r.error });
      results.push({ account_id: a.id, ...r });
    }
    return json({ results }, results.every((r) => r.ok) ? 200 : 500);
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-outcomes", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
