import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { diagnoseAccount } from "../_shared/google-ads-diagnosis-runner.ts";
import { parseMonthlyCap, MAX_MONTHLY_CAP_BRL } from "../_shared/google-ads-settings-core.ts";

/**
 * google-ads-settings — AUTHENTICATED, somente administradores do tenant.
 * Acoes: `set_monthly_cap`, `set_mode` (read_only | approval) e `set_min_roas` (ROAS minimo = 1 / margem; null remove).
 * `auto` NAO e aceito: o modo automatico so entra depois de semanas de historico com aprovacao.
 * Acao `set_monthly_cap`: define (ou remove, com null) o teto de gastos por mes da conta, em reais.
 * O teto vira google_ads_accounts.guardrails.monthly_budget_cap_micros e e usado pelo diagnostico (regra R7) e,
 * no futuro, pelo revisor de seguranca. Cada mudanca fica no google_ads_audit_log (antes/depois).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-settings", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId } = await requireUserAuth(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    if (action !== "set_monthly_cap" && action !== "set_mode" && action !== "set_min_roas") return json({ error: "Acao desconhecida" }, 400);

    const accountId = typeof body.account_id === "string" ? body.account_id : "";
    if (!UUID_RE.test(accountId)) return json({ error: "account_id invalido" }, 400);
    const cap = action === "set_monthly_cap" ? parseMonthlyCap(body.monthly_cap_brl) : { ok: true as const, micros: null };
    if (!cap.ok) return json({ error: cap.error, max_brl: MAX_MONTHLY_CAP_BRL }, 400);
    if (action === "set_mode" && body.mode !== "read_only" && body.mode !== "approval") {
      return json({ error: "Modo invalido (use read_only ou approval)" }, 400);
    }
    let minRoas: number | null = null;
    if (action === "set_min_roas") {
      if (body.min_roas === null) minRoas = null;
      else if (typeof body.min_roas === "number" && Number.isFinite(body.min_roas) && body.min_roas >= 0.5 && body.min_roas <= 50) {
        minRoas = Math.round(body.min_roas * 100) / 100;
      } else return json({ error: "min_roas deve ser um numero entre 0,5 e 50 (ou null para remover)" }, 400);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: tenantId });
    if (!isAdmin) return json({ error: "Somente administradores podem alterar o teto de gastos" }, 403);

    // O filtro por tenant vem do JWT: um admin nunca altera conta de outro tenant.
    const { data: account, error: accErr } = await supabase.from("google_ads_accounts")
      .select("id, tenant_id, guardrails, mode").eq("id", accountId).eq("tenant_id", tenantId).maybeSingle();
    if (accErr) throw new Error(accErr.message);
    if (!account) return json({ error: "Conta nao encontrada" }, 404);

    const before = (account.guardrails ?? {}) as Record<string, unknown>;
    const after: Record<string, unknown> = { ...before };
    let modeAfter: string = account.mode;
    let entity = "monthly_budget_cap_micros";
    if (action === "set_monthly_cap") {
      if (cap.micros === null) delete after.monthly_budget_cap_micros;
      else after.monthly_budget_cap_micros = cap.micros;
    } else if (action === "set_min_roas") {
      entity = "min_roas";
      if (minRoas === null) delete after.min_roas;
      else after.min_roas = minRoas;
    } else {
      entity = "mode";
      modeAfter = body.mode;
    }

    const { error: updErr } = await supabase.from("google_ads_accounts").update({ guardrails: after, mode: modeAfter }).eq("id", accountId);
    if (updErr) throw new Error(updErr.message);

    await supabase.from("google_ads_audit_log").insert({
      tenant_id: tenantId, account_id: accountId, actor: `user:${userId}`, action: action === "set_mode" ? "mode_change" : "guardrails_change",
      entity, before_state: { ...before, mode: account.mode }, after_state: { ...after, mode: modeAfter },
    });

    // Reavalia na hora: o alerta de orcamento acima do teto (R7) aparece/some sem esperar o proximo cron.
    const diagnosis = await diagnoseAccount(supabase, accountId, `user:${userId}`);
    return json({ ok: true, monthly_budget_cap_micros: cap.micros, mode: modeAfter, min_roas: minRoas, diagnosis });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-settings", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
