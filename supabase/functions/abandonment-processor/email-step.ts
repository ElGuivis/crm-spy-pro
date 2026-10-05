import { getEmailConfig } from "../_shared/email-sender.ts";
import { RateLimiter, SmtpSession } from "../_shared/email-sender-pool.ts";
import { htmlToText, injectPreheader, listUnsubscribeHeaders } from "../_shared/email-prepare.ts";
import { injectTracking } from "../_shared/email-tracking.ts";
import { replaceVariables } from "../_shared/email-variable-replacer.ts";
import type { IssuedCoupon } from "../_shared/email-coupons.ts";
import { buildCartVars, type FlowStep } from "../_shared/abandonment-render.ts";
import type { Candidate, Ctx, EmailRuntime, Flow, FlowCampaign, SendOutcome } from "./types.ts";

const DEFAULT_SENDS_PER_SECOND = 5;
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

async function loadCampaign(ctx: Ctx, id: string): Promise<FlowCampaign | null> {
  if (ctx.campaigns.has(id)) return ctx.campaigns.get(id) ?? null;
  const { data } = await ctx.supabase.from("email_campaigns")
    .select("id, internal_name, subject, preheader, content_html, email_integration_id").eq("id", id).not("flow_kind", "is", null).maybeSingle();
  ctx.campaigns.set(id, (data as FlowCampaign | null) ?? null);
  return (data as FlowCampaign | null) ?? null;
}

/** Conexão SMTP e remetentes (em rodízio) da integração, uma vez por rodada. */
async function loadRuntime(ctx: Ctx, integrationId: string): Promise<EmailRuntime | { error: string }> {
  const cached = ctx.email.get(integrationId);
  if (cached) return cached;
  const { config, error } = await getEmailConfig(ctx.supabase, integrationId);
  if (error || !config) { const r = { error: error || "Configuração de e-mail inválida" }; ctx.email.set(integrationId, r); return r; }
  const { data: integ } = await ctx.supabase.from("email_integrations").select("max_sends_per_second").eq("id", integrationId).single();
  const senders = [{ email: config.senderEmail || config.smtpUser, name: config.senderName }];
  const { data: extra } = await ctx.supabase.from("email_integration_senders").select("sender_email, sender_name").eq("integration_id", integrationId).eq("is_active", true);
  for (const s of extra ?? []) senders.push({ email: s.sender_email as string, name: (s.sender_name as string | null) || config.senderName });
  const runtime: EmailRuntime = { config, limiter: new RateLimiter(integ?.max_sends_per_second ?? DEFAULT_SENDS_PER_SECOND), session: new SmtpSession(config), senders, next: 0 };
  ctx.email.set(integrationId, runtime);
  return runtime;
}

export async function closeEmailSessions(ctx: Ctx) {
  await Promise.all([...ctx.email.values()].map((r) => ("session" in r ? r.session.close() : Promise.resolve())));
}

/** Envia o e-mail de uma etapa para um abandono. Não grava o registro de envio (quem chama faz isso). */
export async function sendEmailStep(ctx: Ctx, flow: Flow, step: FlowStep, cand: Candidate, storeUrl: string, coupon: IssuedCoupon): Promise<SendOutcome & { flowCampaignId?: string }> {
  const email = cand.recipient_email!;
  const campaign = step.email?.campaign_id ? await loadCampaign(ctx, step.email.campaign_id) : null;
  if (!campaign?.content_html) return { ok: false, error: "A etapa não tem e-mail salvo. Abra o fluxo e edite o e-mail." };
  if (!campaign.content_html.includes("{{unsubscribe_url}}")) return { ok: false, error: "O e-mail da etapa não tem o link de descadastro ({{unsubscribe_url}})." };
  const integrationId = flow.email_integration_id || campaign.email_integration_id;
  if (!integrationId) return { ok: false, error: "O fluxo não tem integração de e-mail escolhida." };
  const rt = await loadRuntime(ctx, integrationId);
  if ("error" in rt) return { ok: false, error: rt.error, abort: true };

  // um token (descadastro + rastreio) por campanha de etapa + e-mail
  await ctx.supabase.from("email_unsubscribe_tokens").upsert(
    { tenant_id: flow.tenant_id, campaign_id: campaign.id, recipient_email: email, recipient_name: cand.recipient_name },
    { onConflict: "campaign_id,recipient_email", ignoreDuplicates: true },
  );
  const { data: tokenRow } = await ctx.supabase.from("email_unsubscribe_tokens").select("id").eq("campaign_id", campaign.id).eq("recipient_email", email).maybeSingle();
  if (!tokenRow?.id) return { ok: false, error: "Não foi possível criar o token de descadastro." };
  const tokenId = tokenRow.id as string;
  const unsubscribeUrl = `${ctx.supabaseUrl}/functions/v1/email-unsubscribe?token=${tokenId}`;

  const first = (cand.recipient_name ?? "").trim().split(/\s+/);
  const data = {
    first_name: titleCase(first[0] || ""), last_name: titleCase(first.slice(1).join(" ")), email, phone: cand.recipient_phone || "", company: "",
    coupon_code: coupon.code, coupon_value: coupon.discount, coupon_expires: coupon.expires, unsubscribe_url: unsubscribeUrl,
    ...buildCartVars(cand.items ?? [], cand.value, storeUrl),
  };
  const html = replaceVariables(injectPreheader(campaign.content_html, campaign.preheader), data);
  const subject = replaceVariables(campaign.subject, data);

  const sender = rt.senders[rt.next++ % rt.senders.length];
  await rt.limiter.wait();
  const result = await rt.session.send(sender, {
    to: email, subject, text: htmlToText(html) || subject,
    html: injectTracking(html, ctx.supabaseUrl, tokenId, campaign.internal_name),
    headers: listUnsubscribeHeaders(unsubscribeUrl),
  });
  const nowIso = new Date().toISOString();
  await ctx.supabase.from("email_campaign_logs").insert({
    tenant_id: flow.tenant_id, campaign_id: campaign.id, recipient_email: email, recipient_name: cand.recipient_name, sender_email: sender.email,
    status: result.success ? "delivered" : "failed", error_message: result.success ? null : result.error,
    sent_at: result.success ? nowIso : null, delivered_at: result.success ? nowIso : null,
    event_type: result.success ? "delivery_accepted" : "delivery_failed",
    event_data: { provider: "smtp", sender: sender.email, flow: flow.kind, step: step.id, attempts: result.attempts, permanent: result.permanent ?? false },
    is_test: false,
  });
  await ctx.supabase.rpc("bump_flow_campaign", { p_campaign_id: campaign.id, p_ok: result.success });
  if (result.auth) return { ok: false, error: `O servidor SMTP recusou o login (${result.error}).`, abort: true, flowCampaignId: campaign.id };
  return { ok: result.success, error: result.success ? undefined : (result.error ?? "Falha no envio"), coupon: coupon.code || undefined, flowCampaignId: campaign.id };
}
