import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendEmail, getEmailConfig } from "../_shared/email-sender.ts";
import { generateEmailHtml } from "../_shared/email-html-generator.ts";
import { replaceVariables } from "../_shared/email-variable-replacer.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { safeParseAudienceReference, resolveRecipients } from "./audience-resolvers.ts";
import { injectTracking, getSuppressedEmailSet } from "./send-helpers.ts";

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("email-campaign-send", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let campaignId: string | null = null;

  try {
    const auth = await requireUserOrInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let tenantId: string;
    if (auth.isInternal) {
      const payload = await req.clone().json();
      const cId = String(payload?.campaign_id || "").trim();
      if (!cId) throw new Error("Missing campaign_id");
      const { data: camp } = await supabase.from("email_campaigns").select("tenant_id").eq("id", cId).single();
      if (!camp?.tenant_id) throw new Error("Campaign not found");
      tenantId = camp.tenant_id;
    } else {
      tenantId = auth.tenantId!;
    }

    const payload = await req.json();
    campaignId = String(payload?.campaign_id || "").trim();
    if (!campaignId) throw new Error("Missing campaign_id");

    if (!auth.isInternal) {
      await requireResource(supabase, "email_campaigns", campaignId, tenantId, req);
    }

    const { data: campaign, error: claimError } = await supabase
      .from("email_campaigns")
      .update({ status: "sending", started_at: new Date().toISOString(), error_message: null })
      .eq("id", campaignId).eq("tenant_id", tenantId).in("status", ["draft", "scheduled", "paused", "error"])
      .select("id, tenant_id, name, status, subject, body_html, body_text, content_html, content_json, preheader, sender_name, sender_email, reply_to, email_integration_id, audience_type, audience_reference, total_recipients, total_sent, total_failed, total_opened, total_clicked, total_unsubscribed, total_bounced, total_complained, utm_source, utm_medium, utm_campaign, utm_content, tracking_enabled, unsubscribe_enabled, test_recipients, scheduled_at, started_at, completed_at, error_message, ab_test_id, ab_variant, ab_split_pct, ab_offset_pct")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!campaign) {
      return new Response(JSON.stringify({ success: false, error: "Campanha já foi enviada ou está em andamento" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseHtml = campaign.content_html || generateEmailHtml(campaign.content_json, campaign.preheader || undefined);
    const hasUnsubscribeVariable = baseHtml.includes("{{unsubscribe_url}}");

    await supabase.from("email_campaigns").update({ has_unsubscribe_link: hasUnsubscribeVariable, compliance_checked_at: new Date().toISOString() }).eq("id", campaignId).eq("tenant_id", tenantId);

    if (!hasUnsubscribeVariable) {
      await supabase.from("email_campaigns").update({ status: "error", completed_at: new Date().toISOString(), error_message: "Envio bloqueado: inclua {{unsubscribe_url}} no conteúdo da campanha." }).eq("id", campaignId).eq("tenant_id", tenantId);
      return new Response(JSON.stringify({ success: false, error: "Envio bloqueado por conformidade: falta {{unsubscribe_url}}." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!campaign.email_integration_id) {
      throw new Error("Esta campanha não tem integração de e-mail configurada. Edite a campanha em Email Marketing e selecione uma integração SMTP antes de enviar.");
    }
    const integrationId: string = campaign.email_integration_id;

    const { data: integrationRow } = await supabase.from("email_integrations").select("daily_send_limit, max_sends_per_second").eq("id", integrationId).single();
    const dailySendLimit: number | null = integrationRow?.daily_send_limit ?? null;
    const maxSendsPerSecond: number | null = integrationRow?.max_sends_per_second ?? null;

    const { config: emailConfig, error: configError } = await getEmailConfig(supabase, integrationId);
    if (configError || !emailConfig) throw new Error(configError || "Invalid email configuration");

    const { data: extraSenders } = await supabase.from("email_integration_senders").select("sender_email, sender_name").eq("integration_id", integrationId).eq("is_active", true);

    const sendersList: { email: string; name: string }[] = [{ email: emailConfig.senderEmail || emailConfig.smtpUser, name: emailConfig.senderName }];
    if (extraSenders && extraSenders.length > 0) {
      for (const s of extraSenders) sendersList.push({ email: s.sender_email, name: s.sender_name || emailConfig.senderName });
    }
    log.info(`[EMAIL-CAMPAIGN-SEND] Using ${sendersList.length} sender(s) for rotation`);

    const audienceType = String(campaign.audience_type || "all");
    const audienceReference = safeParseAudienceReference(campaign.audience_reference);
    const recipients = await resolveRecipients(supabase, tenantId, audienceType, audienceReference);

    if (!recipients.length) {
      await supabase.from("email_campaigns").update({ status: "sent", completed_at: new Date().toISOString(), sent_at: new Date().toISOString(), total_recipients: 0, total_sent: 0, total_delivered: 0 }).eq("id", campaignId).eq("tenant_id", tenantId);
      return new Response(JSON.stringify({ success: true, sent: 0, delivered: 0, failed: 0, suppressed: 0, total: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const suppressedSet = await getSuppressedEmailSet(supabase, tenantId, recipients.map((r) => r.email));
    let eligibleRecipients = recipients.filter((r) => !suppressedSet.has(r.email));

    const abVariant   = (campaign as Record<string, unknown>).ab_variant as string | null;
    const abTestId    = (campaign as Record<string, unknown>).ab_test_id as string | null;
    const abSplitPct  = ((campaign as Record<string, unknown>).ab_split_pct as number | null) ?? 50;
    const abOffsetPct = ((campaign as Record<string, unknown>).ab_offset_pct as number | null) ?? 0;

    if (abTestId && abVariant) {
      eligibleRecipients.sort((a, b) => a.email.localeCompare(b.email));
      const total = eligibleRecipients.length;
      const start = Math.floor(total * abOffsetPct / 100);
      const end   = Math.min(total, start + Math.ceil(total * abSplitPct / 100));
      eligibleRecipients = eligibleRecipients.slice(start, end);
      log.info(`[A/B] variant=${abVariant} slice=[${start},${end}) of ${total} eligible`);
    }

    if (dailySendLimit && dailySendLimit > 0) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: sentLast24h } = await supabase.from("email_campaign_logs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["delivered", "sent"]).gte("sent_at", twentyFourHoursAgo);
      const alreadySent = sentLast24h || 0;
      const remaining = Math.max(dailySendLimit - alreadySent, 0);
      log.info(`[EMAIL-CAMPAIGN-SEND] Daily quota: ${alreadySent}/${dailySendLimit} sent, ${remaining} remaining`);
      if (remaining === 0) {
        await supabase.from("email_campaigns").update({ status: "error", completed_at: new Date().toISOString(), error_message: `Cota diária atingida (${dailySendLimit} emails/24h). Tente novamente mais tarde.` }).eq("id", campaignId).eq("tenant_id", tenantId);
        return new Response(JSON.stringify({ success: false, error: `Cota diária atingida (${dailySendLimit}/24h).` }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (eligibleRecipients.length > remaining) {
        log.info(`[EMAIL-CAMPAIGN-SEND] Truncating recipients from ${eligibleRecipients.length} to ${remaining} due to daily limit`);
        eligibleRecipients = eligibleRecipients.slice(0, remaining);
      }
    }

    const sendDelayMs = maxSendsPerSecond && maxSendsPerSecond > 0 ? Math.ceil(1000 / maxSendsPerSecond) : 0;
    if (sendDelayMs > 0) log.info(`[EMAIL-CAMPAIGN-SEND] Rate limiting: ${maxSendsPerSecond}/s → ${sendDelayMs}ms delay between sends`);

    if (suppressedSet.size > 0) {
      await supabase.from("email_campaign_logs").insert({ tenant_id: tenantId, campaign_id: campaignId, event_type: "suppression_filtered", event_data: { total_candidates: recipients.length, suppressed: suppressedSet.size, eligible: eligibleRecipients.length }, status: "info", is_test: false });
    }

    let sentCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;

    for (let i = 0; i < eligibleRecipients.length; i++) {
      const recipient = eligibleRecipients[i];
      let logId: string | null = null;
      const currentSender = sendersList[i % sendersList.length];
      const senderConfig = { ...emailConfig, senderEmail: currentSender.email, senderName: currentSender.name };

      try {
        const { data: tokenRow, error: tokenError } = await supabase.from("email_unsubscribe_tokens").insert({ tenant_id: tenantId, campaign_id: campaignId, recipient_email: recipient.email, recipient_name: recipient.name }).select("id").single();
        if (tokenError || !tokenRow) throw tokenError || new Error("Failed to create unsubscribe token");

        const unsubscribeUrl = `${supabaseUrl}/functions/v1/email-unsubscribe?token=${tokenRow.id}`;
        const htmlWithTracking = injectTracking(baseHtml, supabaseUrl, tokenRow.id);
        const recipientData = {
          first_name: recipient.name?.split(" ")[0] || "",
          last_name: recipient.name?.split(" ").slice(1).join(" ") || "",
          email: recipient.email,
          phone: recipient.phone || "",
          company: "",
          coupon_code: "",
          unsubscribe_url: unsubscribeUrl,
        };

        const personalizedHtml = replaceVariables(htmlWithTracking, recipientData);
        const personalizedSubject = replaceVariables(campaign.subject, recipientData);
        const result = await sendEmail(senderConfig, { to: recipient.email, subject: personalizedSubject, text: "Email Marketing", html: personalizedHtml });

        const nowIso = new Date().toISOString();
        const { data: logRow } = await supabase.from("email_campaign_logs").insert({
          tenant_id: tenantId, campaign_id: campaignId,
          recipient_email: recipient.email, recipient_name: recipient.name, sender_email: currentSender.email,
          status: result.success ? "delivered" : "failed", error_message: result.error || null,
          sent_at: result.success ? nowIso : null, delivered_at: result.success ? nowIso : null,
          event_type: result.success ? "delivery_accepted" : "delivery_failed",
          event_data: { provider: "smtp", sender: currentSender.email, attempts: result.attempts || 1 },
          is_test: false,
        }).select("id").single();
        logId = logRow?.id || null;

        if (result.success) { sentCount++; deliveredCount++; } else { failedCount++; }

        await supabase.from("email_events").insert({ tenant_id: tenantId, campaign_id: campaignId, log_id: logId, event_type: result.success ? "delivered" : "failed", recipient_email: recipient.email, metadata: { reason: result.error || null } });

        if (sendDelayMs > 0 && i < eligibleRecipients.length - 1) await new Promise((resolve) => setTimeout(resolve, sendDelayMs));
      } catch (sendError: unknown) {
        failedCount++;
        await supabase.from("email_campaign_logs").insert({ tenant_id: tenantId, campaign_id: campaignId, recipient_email: recipient.email, recipient_name: recipient.name, status: "failed", error_message: (sendError as Error)?.message || "Unknown send error", event_type: "delivery_failed", event_data: { provider: "smtp", unexpected_error: true }, is_test: false });
      }
    }

    const finalStatus = sentCount === 0 && failedCount > 0 ? "error" : "sent";
    await supabase.from("email_campaigns").update({ status: finalStatus, completed_at: new Date().toISOString(), sent_at: new Date().toISOString(), total_recipients: eligibleRecipients.length, total_sent: sentCount, total_delivered: deliveredCount, error_message: finalStatus === "error" ? "Nenhum destinatário elegível recebeu a campanha com sucesso." : failedCount > 0 ? `${failedCount} envio(s) falharam.` : null }).eq("id", campaignId).eq("tenant_id", tenantId);

    return new Response(JSON.stringify({ success: true, sent: sentCount, delivered: deliveredCount, failed: failedCount, suppressed: suppressedSet.size, total: eligibleRecipients.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[EMAIL-CAMPAIGN-SEND]", error);

    if (campaignId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        await supabase.from("email_campaigns").update({ status: "error", completed_at: new Date().toISOString(), error_message: (error as Error)?.message || "Erro inesperado no envio" }).eq("id", campaignId);
      } catch { /* noop */ }
    }

    return new Response(JSON.stringify({ success: false, error: (error as Error)?.message || "Unexpected error" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
