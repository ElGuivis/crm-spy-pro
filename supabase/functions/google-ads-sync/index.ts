import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { GoogleAdsApiError, loadCredentials } from "../_shared/google-ads-api.ts";
import { MAX_SYNC_DAYS, syncAccount, type SyncResult } from "../_shared/google-ads-sync-core.ts";

/**
 * google-ads-sync — HYBRID.
 *  - Usuario (JWT): sincroniza UMA conta do PROPRIO tenant (account_id obrigatorio).
 *  - Interno (cron / service_role): sincroniza as contas ativas de todos os tenants (ou so a de account_id).
 * Body: { account_id?: uuid, days?: 1..365, end_date?: AAAA-MM-DD (janela que termina nessa data, para carregar o historico) }.
 * Somente leitura na API do Google. Para depois de ~100 s e devolve o que ficou pendente em `skipped`.
 */
const TIME_BUDGET_MS = 100_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-sync", cid);
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
    const days = body.days === undefined ? undefined : Number(body.days);
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > MAX_SYNC_DAYS)) {
      return json({ error: `days deve ser um inteiro entre 1 e ${MAX_SYNC_DAYS}` }, 400);
    }

    const endDate = body.end_date === undefined ? undefined : String(body.end_date);
    if (endDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(Date.parse(endDate)) || endDate < "2015-01-01" || endDate > new Date().toISOString().slice(0, 10))) {
      return json({ error: "end_date deve ser AAAA-MM-DD, entre 2015-01-01 e hoje" }, 400);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let query = supabase
      .from("google_ads_accounts")
      .select("id, tenant_id, customer_id, login_customer_id")
      .neq("status", "paused");
    // Usuario so enxerga o proprio tenant; o filtro vem do JWT, nunca do corpo da requisicao.
    if (!auth.isInternal) query = query.eq("tenant_id", auth.tenantId!);
    if (accountId) query = query.eq("id", accountId);

    const { data: accounts, error } = await query;
    if (error) throw new Error(`Falha ao listar contas: ${error.message}`);
    if (!accounts?.length) return json({ results: [], skipped: [], message: "Nenhuma conta para sincronizar" });

    const creds = loadCredentials();
    const actor = auth.isInternal ? "system" : `user:${auth.userId}`;
    const started = Date.now();
    const results: SyncResult[] = [];
    const skipped: string[] = [];

    for (const account of accounts) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        skipped.push(account.id);
        continue;
      }
      const result = await syncAccount(supabase, account, creds, { days, actor, endDate });
      if (!result.ok) log.warn("sync falhou", { account_id: account.id, error: result.error });
      results.push(result);
    }

    return json({ results, skipped });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-sync", err);
    if (err instanceof GoogleAdsApiError) return json({ error: err.message, code: err.code }, err.status >= 500 ? 502 : 400);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
