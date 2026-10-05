import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { getAutomationConfig, optOutAutomation } from "../_shared/li-marketing.ts";
import { inQuietHours, nextDueStep, stepChannels, type FlowStep } from "../_shared/abandonment-render.ts";
import { closeEmailSessions, sendEmailStep } from "./email-step.ts";
import { loadWhatsAppInstance, sendWhatsAppStep } from "./whatsapp-step.ts";
import { issueStepCoupon, NO_COUPON } from "./coupon-step.ts";
import { canContact, recordTouches, REASON_TEXT, type TouchPurpose } from "../_shared/contact-policy.ts";
import {
  MAX_EMAILS_PER_RUN, MAX_WHATSAPP_PER_RUN, timeLeft,
  type Candidate, type Channel, type Ctx, type Flow, type Kind, type SendOutcome, type Supabase,
} from "./types.ts";

const BUDGET_MS = 85_000;
const SUPPRESSION_REASONS = ["unsubscribed", "bounced", "complained", "invalid", "blocked"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cron (1 min): para cada fluxo LIGADO, envia a próxima etapa (e-mail e/ou WhatsApp) dos abandonos já capturados.
 * Só atende abandonos ocorridos depois de o fluxo ser ligado. Idempotente: cada etapa+canal tem um registro único
 * (abandonment_flow_sends) reservado ANTES do envio, então rodadas simultâneas nunca enviam duas vezes.
 */
Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("abandonment-processor", getCorrelationId(req));

  let ctx: Ctx | null = null;
  try {
    await requireInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    ctx = { supabase, supabaseUrl, log, deadline: Date.now() + BUDGET_MS, sent: { email: 0, whatsapp: 0 }, campaigns: new Map(), email: new Map() };

    await supabase.rpc("refresh_abandonment_recovery"); // quem comprou sai do fluxo antes de qualquer envio
    const { data: flows, error } = await supabase.from("abandonment_flows").select("*").eq("enabled", true);
    if (error) throw error;

    const summary: Record<string, unknown>[] = [];
    for (const flow of (flows ?? []) as Flow[]) {
      if (timeLeft(ctx) < 10_000) break;
      try { summary.push(await processFlow(ctx, flow)); }
      catch (e) { log.error(`[ABANDON] fluxo ${flow.kind}: ${(e as Error).message}`); summary.push({ kind: flow.kind, error: (e as Error).message }); }
    }
    return json({ success: true, sent: ctx.sent, flows: summary });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[ABANDON]", error);
    return json({ success: false, error: (error as Error)?.message ?? "erro" }, 500);
  } finally {
    if (ctx) await closeEmailSessions(ctx);
  }
});

interface SendRow { abandonment_id: string; step_id: string; channel: Channel; status: string; sent_at: string | null }

async function suppressedSet(supabase: Supabase, tenantId: string, emails: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from("email_suppression_list").select("email").eq("tenant_id", tenantId).in("reason", SUPPRESSION_REASONS).in("email", emails.slice(i, i + 200));
    for (const r of data ?? []) out.add(String(r.email).toLowerCase());
  }
  return out;
}

/** Já falamos com esta pessoa há pouco (mesmo fluxo; navegação também respeita carrinho/pedido, que têm mais intenção)? */
async function recentlyContacted(supabase: Supabase, flow: Flow, cand: Candidate): Promise<boolean> {
  if (flow.cooldown_days <= 0 || !cand.recipient_email) return false;
  const kinds: Kind[] = flow.kind === "browse" ? ["browse", "cart", "order"] : [flow.kind];
  const { data: others } = await supabase.from("li_abandonment_campaigns").select("id").eq("tenant_id", flow.tenant_id).eq("recipient_email", cand.recipient_email).in("kind", kinds).neq("id", cand.id).limit(50);
  const ids = (others ?? []).map((o) => o.id as string);
  if (!ids.length) return false;
  const since = new Date(Date.now() - flow.cooldown_days * 86_400_000).toISOString();
  const { count } = await supabase.from("abandonment_flow_sends").select("id", { count: "exact", head: true }).in("abandonment_id", ids).eq("status", "sent").gte("sent_at", since);
  return (count ?? 0) > 0;
}

async function processFlow(ctx: Ctx, flow: Flow): Promise<Record<string, unknown>> {
  const { supabase, log } = ctx;
  const stats = { kind: flow.kind, candidates: 0, email: 0, whatsapp: 0, skipped: 0, failed: 0, note: "" };
  const steps = (Array.isArray(flow.steps) ? flow.steps : []) as FlowStep[];
  if (!steps.some((s) => stepChannels(s).length)) return { ...stats, note: "sem etapas configuradas" };

  const { data: li } = await supabase.from("integrations").select("id, api_key, metadata").eq("tenant_id", flow.tenant_id).eq("type", "loja_integrada").eq("status", "connected").limit(1).maybeSingle();
  const storeUrl = (li?.metadata as { store_url?: string } | null)?.store_url;
  if (!li || !storeUrl) return { ...stats, note: "informe o endereço da loja em Integrações para montar os links" };
  if (inQuietHours(new Date(), flow.quiet_start, flow.quiet_end)) return { ...stats, note: "janela de silêncio" };

  // reservas que ficaram penduradas (queda no meio do envio) viram falha: nunca reenviamos algo que pode ter saído
  await supabase.from("abandonment_flow_sends").update({ status: "failed", reason: "interrompido durante o envio" }).eq("tenant_id", flow.tenant_id).eq("status", "sending").lt("created_at", new Date(Date.now() - 15 * 60_000).toISOString());

  const since = new Date(Math.max(flow.enabled_at ? Date.parse(flow.enabled_at) : Date.now(), Date.now() - flow.max_event_age_hours * 3_600_000)).toISOString();
  let query = supabase.from("li_abandonment_campaigns")
    .select("id, tenant_id, integration_id, kind, automation_id, value, items, recipient_email, recipient_name, recipient_phone, event_at, native_optout_at")
    .eq("tenant_id", flow.tenant_id).eq("kind", flow.kind).eq("flow_status", "open").is("gone_at", null).gte("event_at", since)
    .or("recipient_email.not.is.null,recipient_phone.not.is.null").order("event_at", { ascending: true }).limit(300);
  if (flow.kind !== "browse" && flow.kind !== "welcome" && flow.min_value > 0) query = query.gte("value", flow.min_value);
  const { data: cands } = await query;
  const candidates = (cands ?? []) as Candidate[];
  stats.candidates = candidates.length;
  if (!candidates.length) return stats;

  const { data: sendRows } = await supabase.from("abandonment_flow_sends").select("abandonment_id, step_id, channel, status, sent_at").in("abandonment_id", candidates.map((c) => c.id));
  const byCand = new Map<string, SendRow[]>();
  for (const r of (sendRows ?? []) as SendRow[]) byCand.set(r.abandonment_id, [...(byCand.get(r.abandonment_id) ?? []), r]);

  const suppressed = await suppressedSet(supabase, flow.tenant_id, [...new Set(candidates.map((c) => c.recipient_email).filter((e): e is string => !!e))]);
  const wantsWhatsApp = steps.some((s) => s.whatsapp?.enabled);
  const instance = wantsWhatsApp && flow.whatsapp_integration_id ? await loadWhatsAppInstance(ctx, flow.whatsapp_integration_id) : null;
  const liAuth = li.api_key ? liAuthHeader(li.api_key) : null;
  let storeId: number | null = null;

  for (const cand of candidates) {
    if (timeLeft(ctx) < 8_000) break;
    if (ctx.sent.email >= MAX_EMAILS_PER_RUN && ctx.sent.whatsapp >= MAX_WHATSAPP_PER_RUN) break;

    // retira a pessoa da automação nativa da loja (evita receber duas vezes sem desligar a nativa para todo mundo)
    if (flow.opt_out_native && liAuth && cand.recipient_email && !cand.native_optout_at) {
      try {
        storeId ??= (await getAutomationConfig(liAuth)).storeId;
        await optOutAutomation(liAuth, cand.recipient_email, storeId, cand.automation_id);
        await supabase.from("li_abandonment_campaigns").update({ native_optout_at: new Date().toISOString() }).eq("id", cand.id);
      } catch (e) { log.warn?.(`[ABANDON] opt-out nativo falhou: ${(e as Error).message}`); }
    }

    const rows = byCand.get(cand.id) ?? [];
    const done = new Set(rows.map((r) => `${r.step_id}:${r.channel}`));
    const sentTimes = rows.filter((r) => r.status === "sent" && r.sent_at).map((r) => Date.parse(r.sent_at!));
    const step = nextDueStep(steps, Date.parse(cand.event_at), Date.now(), done, sentTimes.length ? Math.max(...sentTimes) : null);
    if (!step) {
      const allDone = steps.every((s) => stepChannels(s).every((c) => done.has(`${s.id}:${c}`)));
      if (allDone && rows.length) await supabase.from("li_abandonment_campaigns").update({ flow_status: "done" }).eq("id", cand.id);
      continue;
    }
    if (rows.length === 0 && await recentlyContacted(supabase, flow, cand)) {
      await supabase.from("li_abandonment_campaigns").update({ flow_status: "excluded" }).eq("id", cand.id);
      stats.skipped++;
      continue;
    }

    const pending = stepChannels(step).filter((c) => !done.has(`${step.id}:${c}`));
    const purpose: TouchPurpose = flow.kind === "welcome" ? "welcome" : "recovery";
    const record = async (channel: Channel, status: "skipped" | "failed" | "sent", extra: Record<string, unknown> = {}) => {
      await supabase.from("abandonment_flow_sends").upsert(
        { tenant_id: flow.tenant_id, abandonment_id: cand.id, kind: flow.kind, step_id: step.id, channel, status, sent_at: status === "sent" ? new Date().toISOString() : null, ...extra },
        { onConflict: "abandonment_id,step_id,channel", ignoreDuplicates: true },
      );
    };

    // canais que realmente vão sair agora (o resto vira "pulado" com o motivo, e a sequência segue)
    const willSend: Channel[] = [];
    for (const channel of pending) {
      if (channel === "email") {
        if (!cand.recipient_email) { await record("email", "skipped", { reason: "sem e-mail" }); stats.skipped++; continue; }
        if (suppressed.has(cand.recipient_email)) { await record("email", "skipped", { reason: "e-mail na lista de supressão" }); stats.skipped++; continue; }
        if (ctx.sent.email >= MAX_EMAILS_PER_RUN) continue;
      } else {
        if (!cand.recipient_phone) { await record("whatsapp", "skipped", { reason: "sem telefone" }); stats.skipped++; continue; }
        if (!instance) { await record("whatsapp", "skipped", { reason: "WhatsApp do fluxo não está conectado" }); stats.skipped++; continue; }
        if (ctx.sent.whatsapp >= MAX_WHATSAPP_PER_RUN) continue;
      }
      // regra única de contato (supressão, telefone bloqueado, limite diário por pessoa): bloqueio permanente pula o canal; temporário adia a etapa
      const rule = await canContact(supabase, flow.tenant_id, channel === "email" ? { email: cand.recipient_email } : { phone: cand.recipient_phone }, purpose);
      if (!rule.ok) {
        if (rule.permanent) { await record(channel, "skipped", { reason: REASON_TEXT[rule.reason] ?? rule.reason }); stats.skipped++; }
        else stats.note = `adiado: ${REASON_TEXT[rule.reason] ?? rule.reason}`;
        continue;
      }
      willSend.push(channel);
    }
    if (!willSend.length) continue;

    const issued = await issueStepCoupon(ctx, flow, step, cand);
    if (issued.error) {
      for (const channel of willSend) await record(channel, "failed", { reason: issued.error.slice(0, 300) });
      stats.failed += willSend.length;
      if (issued.abort) break;
      continue;
    }

    for (const channel of willSend) {
      // reserva o envio: se outra rodada já reservou, não envia
      const { data: claimed } = await supabase.from("abandonment_flow_sends")
        .upsert({ tenant_id: flow.tenant_id, abandonment_id: cand.id, kind: flow.kind, step_id: step.id, channel, status: "sending" }, { onConflict: "abandonment_id,step_id,channel", ignoreDuplicates: true })
        .select("id").maybeSingle();
      if (!claimed) continue;

      const outcome: SendOutcome & { flowCampaignId?: string } = channel === "email"
        ? await sendEmailStep(ctx, flow, step, cand, storeUrl, issued.coupon ?? NO_COUPON)
        : await sendWhatsAppStep(ctx, flow, step, cand, storeUrl, instance!, issued.coupon ?? NO_COUPON);

      if (outcome.abort && !outcome.ok) {
        // problema geral (login SMTP, tokens, Evolution): devolve a reserva e para este fluxo até corrigirem
        await supabase.from("abandonment_flow_sends").delete().eq("id", claimed.id);
        log.error(`[ABANDON] ${flow.kind}/${channel} interrompido: ${outcome.error}`);
        stats.note = outcome.error ?? "interrompido";
        return stats;
      }
      await supabase.from("abandonment_flow_sends").update({
        status: outcome.ok ? "sent" : "failed", reason: outcome.ok ? null : (outcome.error ?? "falha").slice(0, 300),
        coupon_code: outcome.coupon ?? null, flow_campaign_id: outcome.flowCampaignId ?? null, sent_at: outcome.ok ? new Date().toISOString() : null,
      }).eq("id", claimed.id);
      if (outcome.ok) {
        stats[channel]++; ctx.sent[channel]++;
        await recordTouches(supabase, flow.tenant_id, [{ target: { email: cand.recipient_email, phone: cand.recipient_phone }, channel, purpose, ref: outcome.flowCampaignId ?? flow.kind }]);
      } else stats.failed++;
      if (channel === "whatsapp") await sleep(4_000); // espaça as mensagens (proteção contra bloqueio do número)
    }
  }
  return stats;
}
