import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { refreshEconomics, saveEconomicsSettings } from "../_shared/google-ads-economics-runner.ts";

/**
 * google-ads-economics — HYBRID. Mede a economia real da loja nos pedidos do CRM (sem IA, somente leitura no Google).
 *  - Usuario admin: `refresh` (recalcula), `save` (imposto/taxa/frete e metas de ROAS) de uma conta do PROPRIO tenant.
 *  - Interno (cron): `refresh` de todas as contas ativas.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-economics", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUserOrInternalAuth(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action === "save" ? "save" : "refresh";
    const accountId = typeof body.account_id === "string" ? body.account_id : undefined;
    if (accountId && !UUID_RE.test(accountId)) return json({ error: "account_id invalido" }, 400);
    if (!auth.isInternal && !accountId) return json({ error: "account_id obrigatorio" }, 400);
    if (action === "save" && (auth.isInternal || !accountId)) return json({ error: "Somente um administrador, com account_id, pode salvar" }, 403);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let q = supabase.from("google_ads_accounts").select("id, tenant_id").neq("status", "paused");
    if (!auth.isInternal) {
      const { data: isAdmin } = await supabase.rpc("is_tenant_admin", { _user_id: auth.userId, _tenant_id: auth.tenantId });
      if (!isAdmin) return json({ error: "Somente administradores" }, 403);
      q = q.eq("tenant_id", auth.tenantId!);
    }
    if (accountId) q = q.eq("id", accountId);
    const { data: accounts, error } = await q;
    if (error) throw new Error(error.message);
    if (!accounts?.length) return json({ results: [] });

    const results = [];
    for (const a of accounts) {
      if (action === "save") {
        const s = await saveEconomicsSettings(supabase, { accountId: a.id, tenantId: a.tenant_id, actor: `user:${auth.userId}`, inputs: body.inputs, targets: body.targets });
        if (!s.ok) return json({ error: s.error }, 400);
      }
      const r = await refreshEconomics(supabase, a.id);
      if (!r.ok) log.warn("economia falhou", { account_id: a.id, error: r.error });
      results.push({ account_id: a.id, ok: r.ok, error: r.error, view: r.view });
    }
    return json({ results }, results.every((r) => r.ok) ? 200 : 500);
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-economics", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
