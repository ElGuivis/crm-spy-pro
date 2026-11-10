import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { loadCredentials } from "../_shared/google-ads-api.ts";
import { APPLY_KINDS, applyChange, orderPlan, type ApplyKind } from "../_shared/google-ads-apply-core.ts";
import { applyConversionGoal, applyNegatives, applyRebuild, revertBuild } from "../_shared/google-ads-build-apply.ts";
import { diagnoseAccount } from "../_shared/google-ads-diagnosis-runner.ts";
import { parseQuickAction, sanitizeDraftPatch } from "../_shared/google-ads-build-draft.ts";

/**
 * google-ads-apply — AUTHENTICATED, somente administradores do tenant. UNICA funcao que ESCREVE no Google Ads.
 *  - action "apply":  { account_id, recommendation_ids: uuid[] (1..10) }  aplica recomendacoes pendentes, na ordem segura.
 *  - action "revert": { account_id, audit_id }  desfaz uma aplicacao anterior (volta ao estado "antes" do log).
 *  - action "quick": { account_id, campaign_id, op: pause|enable|set_budget, daily_budget_brl? } cria a proposta na hora e aplica pelo mesmo caminho (mesmas travas).
 *  - action "update_draft": { account_id, recommendation_id, patch }  ajusta o rascunho de uma proposta de construcao (so subconjunto do que foi proposto + texto do anuncio).
 * Tipos de proposta: orcamento/pausar/ligar (apply-core), palavras negativas e reconstrucao de campanha de Pesquisa (build-apply).
 * Todas as travas ficam em _shared/google-ads-apply-core.ts e valem aqui no servidor, nao na tela.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 10;
const BUILD_KINDS = ["add_negative_keywords", "rebuild_search_structure", "set_conversion_goal"];

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
    if (body.action !== "apply" && body.action !== "revert" && body.action !== "update_draft" && body.action !== "quick") return json({ error: "Acao desconhecida" }, 400);

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
      if (/^(negatives|rebuild):\d+$|^goal:[A-Z_]+~[A-Z_]+$/.test(row?.entity ?? "")) {
        const r = await revertBuild(supabase, creds, { accountId, tenantId, actor, auditId });
        return json({ results: [{ audit_id: auditId, ...r }] }, r.ok ? 200 : 422);
      }
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

    if (body.action === "update_draft") {
      const recId = typeof body.recommendation_id === "string" ? body.recommendation_id : "";
      if (!UUID_RE.test(recId)) return json({ error: "recommendation_id invalido" }, 400);
      const { data: rec } = await supabase.from("google_ads_recommendations").select("id, kind, status, payload")
        .eq("id", recId).eq("tenant_id", tenantId).eq("account_id", accountId).maybeSingle();
      if (!rec || !BUILD_KINDS.includes(rec.kind) || !["pending", "failed"].includes(rec.status)) return json({ error: "Proposta nao editavel" }, 400);
      const next = sanitizeDraftPatch(rec.kind, rec.payload as Record<string, unknown>, body.patch);
      if (!next.ok) return json({ error: next.error }, 400);
      const { error: upErr } = await supabase.from("google_ads_recommendations").update({ payload: next.payload, status: "pending", error: null }).eq("id", recId);
      if (upErr) throw new Error(upErr.message);
      return json({ ok: true, payload: next.payload });
    }

    let ids: unknown = body.recommendation_ids;
    if (body.action === "quick") {
      const cid2 = Number(body.campaign_id);
      const { data: camp } = await supabase.from("google_ads_campaigns").select("campaign_id, name").eq("account_id", accountId).eq("campaign_id", Number.isInteger(cid2) ? cid2 : -1).maybeSingle();
      if (!camp) return json({ error: "Campanha nao encontrada nesta conta" }, 404);
      const quick = parseQuickAction(body, String(camp.name));
      if (!quick.ok) return json({ error: quick.error }, 400);
      const { data: created, error: insErr } = await supabase.from("google_ads_recommendations").insert({
        tenant_id: tenantId, account_id: accountId, agent: "manual_action", kind: quick.kind, severity: "medium", risk: quick.kind === "pause_campaign" ? "low" : "medium",
        title: quick.title, rationale: "Acao pedida por voce direto na tabela de campanhas.", payload: quick.payload, status: "pending",
      }).select("id").single();
      if (insErr || !created) throw new Error(insErr?.message ?? "falha ao registrar a acao");
      ids = [created.id];
    }
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_ITEMS || !ids.every((i) => typeof i === "string" && UUID_RE.test(i))) {
      return json({ error: `recommendation_ids deve ter de 1 a ${MAX_ITEMS} ids validos` }, 400);
    }
    const { data: recs, error } = await supabase.from("google_ads_recommendations")
      .select("id, kind, status, payload").in("id", ids).eq("tenant_id", tenantId).eq("account_id", accountId);
    if (error) throw new Error(error.message);
    const usable = (recs ?? []).filter((r) => (APPLY_KINDS.includes(r.kind as ApplyKind) || BUILD_KINDS.includes(r.kind)) && ["pending", "approved", "failed"].includes(r.status));
    const buildRecs = usable.filter((r) => BUILD_KINDS.includes(r.kind));
    if (!usable.length) return json({ error: "Nenhuma recomendacao aplicavel entre as selecionadas" }, 400);

    const { data: camps } = await supabase.from("google_ads_campaigns").select("campaign_id, daily_budget_micros").eq("account_id", accountId);
    const current = new Map((camps ?? []).map((c) => [Number(c.campaign_id), c.daily_budget_micros == null ? null : Number(c.daily_budget_micros)]));
    const budgetOrdered = orderPlan(usable.filter((r) => !BUILD_KINDS.includes(r.kind)) as Array<{ id: string; kind: string; payload: { campaign_id?: number; daily_budget_micros?: number | null } }>, current);
    const ordered = [...budgetOrdered, ...buildRecs] as Array<{ id: string; kind: string; payload: Record<string, unknown> & { campaign_id?: number; daily_budget_micros?: number | null } }>;

    const results: Array<{ recommendation_id: string; ok: boolean; error?: string; before?: unknown; after?: unknown }> = [];
    for (const r of ordered) {
      const campaignId = Number(r.payload.campaign_id);
      if (r.kind !== "set_conversion_goal" && (!Number.isInteger(campaignId) || campaignId <= 0)) {
        results.push({ recommendation_id: r.id, ok: false, error: "campaign_id invalido na recomendacao" });
        break;
      }
      const out = r.kind === "set_conversion_goal"
        ? await applyConversionGoal(supabase, creds, { accountId, tenantId, actor, recommendationId: r.id, category: String(r.payload.category), origin: String(r.payload.origin) })
        : r.kind === "add_negative_keywords"
        ? await applyNegatives(supabase, creds, { accountId, tenantId, actor, recommendationId: r.id, campaignId, terms: Array.isArray(r.payload.terms) ? (r.payload.terms as string[]) : [] })
        : r.kind === "rebuild_search_structure"
        ? await applyRebuild(supabase, creds, {
          accountId, tenantId, actor, recommendationId: r.id, campaignId, adGroupId: Number(r.payload.ad_group_id),
          keywords: Array.isArray(r.payload.keywords) ? (r.payload.keywords as Array<{ text: string; match_type: "EXACT" | "PHRASE" | "BROAD" }>) : [],
          enableAdIds: Array.isArray(r.payload.enable_ad_ids) ? (r.payload.enable_ad_ids as number[]).map(Number) : [],
          newAd: (r.payload.new_ad as { headlines: string[]; descriptions: string[]; final_url: string } | null) ?? null,
        })
        : await applyChange(supabase, creds, {
          accountId, tenantId, actor, kind: r.kind as ApplyKind, campaignId,
          newBudgetMicros: r.payload.daily_budget_micros ?? null, recommendationId: r.id,
        });
      await supabase.from("google_ads_recommendations").update(out.ok
        ? { status: "applied", applied_at: new Date().toISOString(), decided_by: userId, decided_at: new Date().toISOString(), error: null }
        : { status: "failed", error: (out.error ?? "erro").slice(0, 500) }).eq("id", r.id);
      results.push({ recommendation_id: r.id, ok: out.ok, error: out.error, before: (out as { before?: unknown }).before, after: (out as { after?: unknown; detail?: unknown }).after ?? (out as { detail?: unknown }).detail });
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
