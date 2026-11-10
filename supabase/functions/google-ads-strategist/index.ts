import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { proposeRebuilds } from "../_shared/google-ads-build-runner.ts";
import { runStrategy } from "../_shared/google-ads-strategy-runner.ts";

/**
 * google-ads-strategist — HYBRID.
 *  - Usuario (JWT, admin do tenant): roda a analise estrategica de UMA conta do proprio tenant (account_id obrigatorio).
 *  - Interno (cron / service_role): roda para o account_id informado.
 * Somente leitura no Google Ads: grava relatorio e plano em google_ads_recommendations (pendentes de aprovacao).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-strategist", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUserOrInternalAuth(req);
    const body = await req.json().catch(() => ({}));
    const accountId = typeof body.account_id === "string" ? body.account_id : "";
    if (!UUID_RE.test(accountId)) return json({ error: "account_id invalido" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let q = supabase.from("google_ads_accounts").select("id").eq("id", accountId);
    if (!auth.isInternal) {
      const { data: isAdmin } = await supabase.rpc("is_tenant_admin", { _user_id: auth.userId, _tenant_id: auth.tenantId });
      if (!isAdmin) return json({ error: "Somente administradores" }, 403);
      q = q.eq("tenant_id", auth.tenantId!);
    }
    const { data: acc, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!acc) return json({ error: "Conta nao encontrada" }, 404);

    const result = await runStrategy(supabase, accountId, auth.isInternal ? "system" : `user:${auth.userId}`);
    if (!result.ok) log.warn("estrategia falhou", { error: result.error });
    // Propostas de reconstrucao das campanhas boas que nao veiculam (so propoe; quem aplica e o google-ads-apply).
    if (result.ok && result.report) {
      const b = await proposeRebuilds(supabase, accountId, result.report);
      if (!b.ok) log.warn("propostas de reconstrucao falharam", { error: b.error });
    }
    return json(result, result.ok ? 200 : 500);
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-strategist", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
