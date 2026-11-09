import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { diagnoseAccount, type DiagnoseResult } from "../_shared/google-ads-diagnosis-runner.ts";

/**
 * google-ads-diagnose — HYBRID. Agente "diagnostico-de-conta" (regras, sem IA, sem custo de tokens).
 *  - Usuario (JWT): diagnostica UMA conta do proprio tenant (account_id obrigatorio).
 *  - Interno (cron): diagnostica as contas ativas de todos os tenants (ou so a de account_id).
 * Le dados ja sincronizados; nao chama o Google Ads e nao altera a conta de anuncios.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-diagnose", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUserOrInternalAuth(req);
    const body = await req.json().catch(() => ({}));
    const accountId = typeof body.account_id === "string" ? body.account_id : undefined;
    if (accountId && !UUID_RE.test(accountId)) return json({ error: "account_id invalido" }, 400);
    // Regra de HYBRID: chamada de usuario nomeia o recurso; a varredura geral e so do cron.
    if (!auth.isInternal && !accountId) return json({ error: "account_id obrigatorio" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let query = supabase.from("google_ads_accounts").select("id").neq("status", "paused");
    // Usuario so enxerga o proprio tenant; o filtro vem do JWT, nunca do corpo da requisicao.
    if (!auth.isInternal) query = query.eq("tenant_id", auth.tenantId!);
    if (accountId) query = query.eq("id", accountId);
    const { data: accounts, error } = await query;
    if (error) throw new Error(`Falha ao listar contas: ${error.message}`);
    if (!accounts?.length) return json({ results: [], message: "Nenhuma conta para diagnosticar" });

    const actor = auth.isInternal ? "system" : `user:${auth.userId}`;
    const results: DiagnoseResult[] = [];
    for (const a of accounts) {
      const r = await diagnoseAccount(supabase, a.id, actor);
      if (!r.ok) log.warn("diagnostico falhou", { account_id: a.id, error: r.error });
      results.push(r);
    }
    return json({ results });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-diagnose", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
