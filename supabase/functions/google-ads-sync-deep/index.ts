import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { loadCredentials } from "../_shared/google-ads-api.ts";
import { DATASET_NAMES, defaultWindow, PRESETS, runDeep, type DeepResult } from "../_shared/google-ads-deep-runner.ts";

/**
 * google-ads-sync-deep — HYBRID. Coleta o maximo de dados do Google Ads (somente leitura): termos de pesquisa, palavras-chave,
 * anuncios, dispositivo, dia/hora, regioes, participacao de impressoes, produtos, paginas de destino, publico, ativos...
 *  - Usuario (JWT): uma conta do PROPRIO tenant (account_id obrigatorio).
 *  - Interno (cron / service_role): todas as contas ativas.
 * Body: { account_id?: uuid, preset?: "structure"|"stats"|"static"|"all", datasets?: string[], start?: AAAA-MM-DD, end?: AAAA-MM-DD }.
 * Para depois de ~95 s e devolve o que faltou em `skipped`.
 */
const TIME_BUDGET_MS = 95_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string) => DATE_RE.test(d) && !Number.isNaN(Date.parse(d)) && d >= "2015-01-01" && d <= new Date().toISOString().slice(0, 10);

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-sync-deep", cid);
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

    let names: string[];
    if (Array.isArray(body.datasets)) {
      names = body.datasets.map(String);
      if (names.length < 1 || names.length > 30 || names.some((n) => !DATASET_NAMES.includes(n))) {
        return json({ error: "datasets invalidos", validos: DATASET_NAMES }, 400);
      }
    } else {
      const preset = typeof body.preset === "string" ? body.preset : "structure";
      if (!PRESETS[preset]) return json({ error: "preset invalido", validos: Object.keys(PRESETS) }, 400);
      names = PRESETS[preset];
    }

    const win = defaultWindow();
    const start = body.start === undefined ? win.start : String(body.start);
    const end = body.end === undefined ? win.end : String(body.end);
    if (!validDate(start) || !validDate(end) || start > end) return json({ error: "start/end invalidos (AAAA-MM-DD, start <= end, ate hoje)" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let query = supabase.from("google_ads_accounts").select("id, tenant_id, customer_id, login_customer_id").neq("status", "paused");
    if (!auth.isInternal) query = query.eq("tenant_id", auth.tenantId!);
    if (accountId) query = query.eq("id", accountId);
    const { data: accounts, error } = await query;
    if (error) throw new Error(`Falha ao listar contas: ${error.message}`);
    if (!accounts?.length) return json({ results: [], message: "Nenhuma conta para sincronizar" });

    const creds = loadCredentials();
    const actor = auth.isInternal ? "system" : `user:${auth.userId}`;
    const started = Date.now();
    const results: DeepResult[] = [];
    for (const account of accounts) {
      const left = TIME_BUDGET_MS - (Date.now() - started);
      if (left <= 0) { results.push({ account_id: account.id, ok: true, done: [], skipped: names, errors: [] }); continue; }
      const r = await runDeep(supabase, account, creds, names, { start, end, budgetMs: left, actor });
      if (!r.ok) log.warn("sync profundo com erros", { account_id: account.id, errors: r.errors });
      results.push(r);
    }
    return json({ results });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-sync-deep", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
