import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { loadCredentials } from "../_shared/google-ads-api.ts";
import { APPLY_KINDS, applyChange, orderPlan, type ApplyKind } from "../_shared/google-ads-apply-core.ts";
import { diagnoseAccount } from "../_shared/google-ads-diagnosis-runner.ts";

/**
 * google-ads-apply — AUTHENTICATED, somente administradores do tenant. UNICA funcao que ESCREVE no Google Ads.
 *  - action "apply":  { account_id, recommendation_ids: uuid[] (1..10) }  aplica recomendacoes pendentes, na ordem segura.
 *  - action "revert": { account_id, audit_id }  desfaz uma aplicacao anterior (volta ao estado "antes" do log).
 * Todas as travas ficam em _shared/google-ads-apply-core.ts e valem aqui no servidor, nao na tela.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 10;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-apply", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId } = await requireUserAuth(req);
    const body = await req.json().catch(() => ({}));
    const accountId = typeof body.account_id === "string" ? body.account_id : "";
    if (!UUID_RE.test(accountId)) return json({ error: "account_id invalido" }, 400);
    if (body.action !== "apply" && body.action !== "revert") return json({ error: "Acao desconhecida" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: tenantId });
    if (!isAdmin) return json({ error: "Somente administradores podem alterar o Google Ads" }, 403);

    const { data: account } = await supabase.from("google_ads_accounts").select("id").eq("id", accountId).eq("tenant_id", tenantId).maybeSingle();
    if (!account) return json({ error: "Conta nao encontrada" }, 404);

    const creds = loadCredentials();
    const actor = `user:${userId}`;

    if (body.action === "revert") {
      const auditId = typeof body.audit_id === "string" ? body.audit_id : "";
      if (!UUID_RE.test(auditId)) return json({ error: "audit_id invalido" }, 400);
      const { data: row } = await supabase.from("google_ads_audit_log").select("id, entity, action, before_state")
        .eq("id", auditId).eq("tenant_id", tenantId).eq("account_id", accountId).maybeSingle();
      const m = /^campaign:(\d+)$/.exec(row?.entity ?? "");
      if (!row || row.action !== "apply" || !m) return json({ error: "Registro nao pode ser desfeito" }, 400);
      const prev = row.before_state as { status?: string; daily_budget_micros?: number | null };
      const restoreStatus = prev.status === "ENABLED" || prev.status === "PAUSED" ? prev.status : undefined;
      const result = await applyChange(supabase, creds, {
        accountId, tenantId, actor, kind: "adjust_budget", campaignId: Number(m[1]),
        newBudgetMicros: prev.daily_budget_micros ?? null, restoreStatus, auditAction: "revert",
      });
      return json({ results: [{ audit_id: auditId, ...result }] }, result.ok ? 200 : 422);
    }

    const ids: unknown = body.recommendation_ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_ITEMS || !ids.every((i) => typeof i === "string" && UUID_RE.test(i))) {
      return json({ error: `recommendation_ids deve ter de 1 a ${MAX_ITEMS} ids validos` }, 400);
    }
    const { data: recs, error } = await supabase.from("google_ads_recommendations")
      .select("id, kind, status, payload").in("id", ids).eq("tenant_id", tenantId).eq("account_id", accountId);
    if (error) throw new Error(error.message);
    const usable = (recs ?? []).filter((r) => APPLY_KINDS.includes(r.kind as ApplyKind) && ["pending", "approved", "failed"].includes(r.status));
    if (!usable.length) return json({ error: "Nenhuma recomendacao aplicavel entre as selecionadas" }, 400);

    const { data: camps } = await supabase.from("google_ads_campaigns").select("campaign_id, daily_budget_micros").eq("account_id", accountId);
    const current = new Map((camps ?? []).map((c) => [Number(c.campaign_id), c.daily_budget_micros == null ? null : Number(c.daily_budget_micros)]));
    const ordered = orderPlan(usable as Array<{ id: string; kind: string; payload: { campaign_id?: number; daily_budget_micros?: number | null } }>, current);

    const results: Array<{ recommendation_id: string; ok: boolean; error?: string; before?: unknown; after?: unknown }> = [];
    for (const r of ordered) {
      const campaignId = Number(r.payload.campaign_id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) {
        results.push({ recommendation_id: r.id, ok: false, error: "campaign_id invalido na recomendacao" });
        break;
      }
      const out = await applyChange(supabase, creds, {
        accountId, tenantId, actor, kind: r.kind as ApplyKind, campaignId,
        newBudgetMicros: r.payload.daily_budget_micros ?? null, recommendationId: r.id,
      });
      await supabase.from("google_ads_recommendations").update(out.ok
        ? { status: "applied", applied_at: new Date().toISOString(), decided_by: userId, decided_at: new Date().toISOString(), error: null }
        : { status: "failed", error: (out.error ?? "erro").slice(0, 500) }).eq("id", r.id);
      results.push({ recommendation_id: r.id, ok: out.ok, error: out.error, before: out.before, after: out.after });
      if (!out.ok) break; // para na primeira falha: nao continua um plano pela metade
    }
    // Reavalia os alertas com o novo estado (ex.: orcamentos acima do teto somem).
    const diagnosis = await diagnoseAccount(supabase, accountId, actor);
    return json({ results, diagnosis }, results.every((x) => x.ok) ? 200 : 422);
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-apply", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
