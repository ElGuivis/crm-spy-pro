import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { sendEmail, getEmailConfig } from "../_shared/email-sender.ts";
import { generateEmailHtml } from "../_shared/email-html-generator.ts";
import { replaceVariables } from "../_shared/email-variable-replacer.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const SUPPRESSION_REASONS = ["unsubscribed", "bounced", "complained", "invalid", "blocked"] as const;

function injectTracking(html: string, supabaseUrl: string, tokenId: string): string {
  const pixel = `<img src="${supabaseUrl}/functions/v1/email-track-open?t=${tokenId}" width="1" height="1" style="display:none;" alt="">`;
  let result = html.includes("</body>") ? html.replace("</body>", `${pixel}</body>`) : html + pixel;

  // Wrap all absolute http/https links with click tracking, skipping tracking/unsubscribe links
  result = result.replace(
    /<a(\s[^>]*?)?href="(https?:\/\/[^"]+)"([^>]*)>/gi,
    (match, before, url, after) => {
      if (url.includes("/email-track-") || url.includes("/email-unsubscribe")) return match;
      const trackUrl = `${supabaseUrl}/functions/v1/email-track-click?t=${tokenId}&url=${encodeURIComponent(url)}`;
      return `<a${before ?? ""}href="${trackUrl}"${after}>`;
    },
  );

  return result;
}

type Recipient = {
  email: string;
  name: string | null;
  phone: string | null;
};

type AudienceFilters = {
  integration_id?: string;
  tag_ids?: string[];
  name_contains?: string;
  email_contains?: string;
  phone_contains?: string;
  doc_contains?: string;
  updated_from?: string;
  updated_to?: string;
};

function normalizeEmail(email?: string | null): string {
  return (email || "").trim().toLowerCase();
}

function safeParseAudienceReference(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function resolveAudienceFilters(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  audienceType: string,
  audienceReference: Record<string, unknown>
): Promise<AudienceFilters> {
  if (audienceType === "segment") {
    const segmentId = String(audienceReference.segment_id || "").trim();
    if (!segmentId) throw new Error("segment_id é obrigatório para audiência por segmento");

    const { data: segment, error } = await supabase
      .from("crm_segments")
      .select("filters")
      .eq("id", segmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !segment) throw new Error("Segmento não encontrado");
    return (segment.filters as AudienceFilters) || {};
  }

  if (audienceType === "custom" || audienceType === "filters") {
    const filters = audienceReference.filters;
    return (typeof filters === "object" && filters !== null ? (filters as AudienceFilters) : {}) || {};
  }

  if (audienceType === "all") {
    // "all" = no filters, fetch all customers with email
    return {};
  }

  // Hard-stop: unknown audience type should NOT fallback to "all"
  throw new Error(`Tipo de audiência desconhecido: "${audienceType}". Envio bloqueado por segurança.`);
}

async function fetchRecipientsByFilters(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  filters: AudienceFilters
): Promise<Recipient[]> {
  let eligibleCustomerIds: string[] | null = null;

  if (Array.isArray(filters.tag_ids) && filters.tag_ids.length > 0) {
    const { data: tagRows, error: tagError } = await supabase
      .from("customer_tags")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .in("tag_id", filters.tag_ids);

    if (tagError) throw tagError;

    eligibleCustomerIds = Array.from(new Set((tagRows || []).map((row: Record<string, unknown>) => row.customer_id))).filter(Boolean);
    if (eligibleCustomerIds.length === 0) return [];
  }

  // Fetch from li_customers (Loja Integrada)
  const fetchLiCustomers = async (): Promise<Recipient[]> => {
    const recipients: Recipient[] = [];
    const pageSize = 500;
    let from = 0;

    while (true) {
      let query = supabase
        .from("li_customers")
        .select("id,email,name,phone")
        .eq("tenant_id", tenantId)
        .not("email", "is", null);

      if (filters.integration_id) query = query.eq("integration_id", filters.integration_id);
      if (filters.name_contains) query = query.ilike("name", `%${filters.name_contains}%`);
      if (filters.email_contains) query = query.ilike("email", `%${filters.email_contains}%`);
      if (filters.phone_contains) query = query.ilike("phone", `%${filters.phone_contains}%`);
      if (filters.doc_contains) query = query.ilike("doc", `%${filters.doc_contains}%`);
      if (filters.updated_from) query = query.gte("updated_at_local", filters.updated_from);
      if (filters.updated_to) query = query.lte("updated_at_local", filters.updated_to);
      if (eligibleCustomerIds) query = query.in("id", eligibleCustomerIds);

      const { data, error } = await query
        .order("updated_at_local", { ascending: false, nullsFirst: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      for (const row of data || []) {
        const email = normalizeEmail((row as Record<string, unknown>).email);
        if (email) recipients.push({ email, name: (row as Record<string, unknown>).name || null, phone: (row as Record<string, unknown>).phone || null });
      }

      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    return recipients;
  };

  // Fetch from bling_customers
  const fetchBlingCustomers = async (): Promise<Recipient[]> => {
    // Skip bling if tag_ids filter is active (tags only apply to li_customers for now)
    if (eligibleCustomerIds) return [];

    const recipients: Recipient[] = [];
    const pageSize = 500;
    let from = 0;

    while (true) {
      let query = supabase
        .from("bling_customers")
        .select("id,email,nome,celular,telefone")
        .eq("tenant_id", tenantId)
        .not("email", "is", null);

      if (filters.integration_id) query = query.eq("integration_id", filters.integration_id);
      if (filters.name_contains) query = query.ilike("nome", `%${filters.name_contains}%`);
      if (filters.email_contains) query = query.ilike("email", `%${filters.email_contains}%`);

      const { data, error } = await query
        .order("created_at", { ascending: false, nullsFirst: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      for (const row of data || []) {
        const email = normalizeEmail((row as Record<string, unknown>).email);
        if (email) {
          recipients.push({
            email,
            name: (row as Record<string, unknown>).nome || null,
            phone: (row as Record<string, unknown>).celular || (row as Record<string, unknown>).telefone || null,
          });
        }
      }

      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    return recipients;
  };

  const [liRecipients, blingRecipients] = await Promise.all([
    fetchLiCustomers(),
    fetchBlingCustomers(),
  ]);

  const deduped = new Map<string, Recipient>();
  for (const recipient of [...liRecipients, ...blingRecipients]) {
    if (!deduped.has(recipient.email)) deduped.set(recipient.email, recipient);
  }

  return Array.from(deduped.values());
}

async function fetchRfmAudienceRecipients(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  audienceId: string
): Promise<Recipient[]> {
  const recipients: Recipient[] = [];
  const pageSize = 500;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("rfm_audience_members")
      .select(`
        snapshot_id,
        customer_rfm_snapshots!inner (
          customer_name,
          customer_phone,
          customer_email,
          customer_data
        )
      `)
      .eq("audience_id", audienceId)
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    for (const row of data || []) {
      const snapshot = (row as Record<string, unknown>).customer_rfm_snapshots;
      if (!snapshot) continue;

      const email = normalizeEmail(snapshot.customer_email || snapshot.customer_data?.email);
      if (!email) continue;

      recipients.push({
        email,
        name: snapshot.customer_name || snapshot.customer_data?.name || null,
        phone: snapshot.customer_phone || snapshot.customer_data?.phone || null,
      });
    }

    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  // Deduplicate
  const deduped = new Map<string, Recipient>();
  for (const r of recipients) {
    if (!deduped.has(r.email)) deduped.set(r.email, r);
  }

  return Array.from(deduped.values());
}

async function resolveRecipients(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  audienceType: string,
  audienceReference: Record<string, unknown>
): Promise<Recipient[]> {
  if (audienceType === "manual") {
    const emails = Array.isArray(audienceReference.emails) ? audienceReference.emails : [];
    const deduped = new Set<string>();

    for (const email of emails) {
      const normalized = normalizeEmail(String(email));
      if (normalized) deduped.add(normalized);
    }

    return Array.from(deduped).map((email) => ({ email, name: null, phone: null }));
  }

  if (audienceType === "rfm") {
    const audienceId = String(audienceReference.rfm_audience_id || "").trim();
    if (!audienceId) throw new Error("rfm_audience_id é obrigatório para audiência RFM");
    return fetchRfmAudienceRecipients(supabase, tenantId, audienceId);
  }

  // "all", "custom", "filters", "segment" all resolve via filters
  const filters = await resolveAudienceFilters(supabase, tenantId, audienceType, audienceReference);
  return fetchRecipientsByFilters(supabase, tenantId, filters);
}

async function getSuppressedEmailSet(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  emails: string[]
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!emails.length) return set;

  for (const emailChunk of chunkArray(Array.from(new Set(emails.map(normalizeEmail))).filter(Boolean), 200)) {
    const { data, error } = await supabase
      .from("email_suppression_list")
      .select("email")
      .eq("tenant_id", tenantId)
      .in("reason", [...SUPPRESSION_REASONS])
      .in("email", emailChunk);

    if (error) throw error;

    for (const row of data || []) {
      set.add(normalizeEmail((row as Record<string, unknown>).email));
    }
  }

  return set;
}

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("email-campaign-send", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let campaignId: string | null = null;

  try {
    const auth = await requireUserOrInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Resolve tenant_id based on auth mode
    let tenantId: string;
    if (auth.isInternal) {
      // When called by scheduler with service_role, get tenant_id from the campaign itself
      const payload = await req.clone().json();
      const cId = String(payload?.campaign_id || "").trim();
      if (!cId) throw new Error("Missing campaign_id");
      const { data: camp } = await supabase
        .from("email_campaigns")
        .select("tenant_id")
        .eq("id", cId)
        .single();
      if (!camp?.tenant_id) throw new Error("Campaign not found");
      tenantId = camp.tenant_id;
    } else {
      tenantId = auth.tenantId!;
    }

    const payload = await req.json();
    campaignId = String(payload?.campaign_id || "").trim();
    if (!campaignId) throw new Error("Missing campaign_id");

    // IDOR protection: validate campaign belongs to user's tenant on user calls
    if (!auth.isInternal) {
      await requireResource(supabase, "email_campaigns", campaignId, tenantId, req);
    }

    const { data: campaign, error: claimError } = await supabase
      .from("email_campaigns")
      .update({
        status: "sending",
        started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", campaignId)
      .eq("tenant_id", tenantId)
      .in("status", ["draft", "scheduled", "paused", "error"])
      .select("id, tenant_id, name, status, subject, body_html, body_text, content_html, content_json, preheader, sender_name, sender_email, reply_to, email_integration_id, audience_type, audience_reference, total_recipients, total_sent, total_failed, total_opened, total_clicked, total_unsubscribed, total_bounced, total_complained, utm_source, utm_medium, utm_campaign, utm_content, tracking_enabled, unsubscribe_enabled, test_recipients, scheduled_at, started_at, completed_at, error_message, ab_test_id, ab_variant, ab_split_pct, ab_offset_pct")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!campaign) {
      return new Response(
        JSON.stringify({ success: false, error: "Campanha já foi enviada ou está em andamento" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseHtml = campaign.content_html || generateEmailHtml(campaign.content_json, campaign.preheader || undefined);
    const hasUnsubscribeVariable = baseHtml.includes("{{unsubscribe_url}}");

    await supabase
      .from("email_campaigns")
      .update({
        has_unsubscribe_link: hasUnsubscribeVariable,
        compliance_checked_at: new Date().toISOString(),
      })
      .eq("id", campaignId)
      .eq("tenant_id", tenantId);

    if (!hasUnsubscribeVariable) {
      await supabase
        .from("email_campaigns")
        .update({
          status: "error",
          completed_at: new Date().toISOString(),
          error_message: "Envio bloqueado: inclua {{unsubscribe_url}} no conteúdo da campanha.",
        })
        .eq("id", campaignId)
        .eq("tenant_id", tenantId);

      return new Response(
        JSON.stringify({ success: false, error: "Envio bloqueado por conformidade: falta {{unsubscribe_url}}." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve which email integration to use
    let integrationId: string | null = campaign.email_integration_id || null;

    if (!integrationId) {
      // Fallback: pick most recent active integration
      const { data: fallbackInteg, error: fallbackErr } = await supabase
        .from("email_integrations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallbackErr || !fallbackInteg) {
        throw new Error("No active email integration found");
      }
      integrationId = fallbackInteg.id;
    }

    // Fetch the full integration row for limits
    const { data: integrationRow } = await supabase
      .from("email_integrations")
      .select("daily_send_limit, max_sends_per_second")
      .eq("id", integrationId)
      .single();

    const dailySendLimit: number | null = integrationRow?.daily_send_limit ?? null;
    const maxSendsPerSecond: number | null = integrationRow?.max_sends_per_second ?? null;

    const { config: emailConfig, error: configError } = await getEmailConfig(supabase, integrationId);
    if (configError || !emailConfig) throw new Error(configError || "Invalid email configuration");

    // Fetch additional senders for round-robin
    const { data: extraSenders } = await supabase
      .from("email_integration_senders")
      .select("sender_email, sender_name")
      .eq("integration_id", integrationId)
      .eq("is_active", true);

    // Build senders list: main integration sender + extra senders
    const sendersList: { email: string; name: string }[] = [
      { email: emailConfig.senderEmail || emailConfig.smtpUser, name: emailConfig.senderName },
    ];
    if (extraSenders && extraSenders.length > 0) {
      for (const s of extraSenders) {
        sendersList.push({ email: s.sender_email, name: s.sender_name || emailConfig.senderName });
      }
    }

    log.info(`[EMAIL-CAMPAIGN-SEND] Using ${sendersList.length} sender(s) for rotation`);

    const audienceType = String(campaign.audience_type || "all");
    const audienceReference = safeParseAudienceReference(campaign.audience_reference);
    const recipients = await resolveRecipients(supabase, tenantId, audienceType, audienceReference);

    if (!recipients.length) {
      await supabase
        .from("email_campaigns")
        .update({
          status: "sent",
          completed_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          total_recipients: 0,
          total_sent: 0,
          total_delivered: 0,
        })
        .eq("id", campaignId)
        .eq("tenant_id", tenantId);

      return new Response(
        JSON.stringify({ success: true, sent: 0, delivered: 0, failed: 0, suppressed: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const suppressedSet = await getSuppressedEmailSet(
      supabase,
      tenantId,
      recipients.map((r) => r.email)
    );

    let eligibleRecipients = recipients.filter((r) => !suppressedSet.has(r.email));

    // A/B split: cada variante recebe sua fatia do array ordenado por email (determinístico)
    const abVariant   = (campaign as Record<string, unknown>).ab_variant as string | null;
    const abTestId    = (campaign as Record<string, unknown>).ab_test_id as string | null;
    const abSplitPct  = ((campaign as Record<string, unknown>).ab_split_pct as number | null) ?? 50;
    const abOffsetPct = ((campaign as Record<string, unknown>).ab_offset_pct as number | null) ?? 0;

    if (abTestId && abVariant) {
      eligibleRecipients.sort((a, b) => a.email.localeCompare(b.email));
      const total   = eligibleRecipients.length;
      const start   = Math.floor(total * abOffsetPct / 100);
      const end     = Math.min(total, start + Math.ceil(total * abSplitPct / 100));
      eligibleRecipients = eligibleRecipients.slice(start, end);
      log.info(`[A/B] variant=${abVariant} slice=[${start},${end}) of ${total} eligible`);
    }

    // Daily quota check
    if (dailySendLimit && dailySendLimit > 0) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: sentLast24h } = await supabase
        .from("email_campaign_logs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["delivered", "sent"])
        .gte("sent_at", twentyFourHoursAgo);

      const alreadySent = sentLast24h || 0;
      const remaining = Math.max(dailySendLimit - alreadySent, 0);

      log.info(`[EMAIL-CAMPAIGN-SEND] Daily quota: ${alreadySent}/${dailySendLimit} sent, ${remaining} remaining`);

      if (remaining === 0) {
        await supabase
          .from("email_campaigns")
          .update({
            status: "error",
            completed_at: new Date().toISOString(),
            error_message: `Cota diária atingida (${dailySendLimit} emails/24h). Tente novamente mais tarde.`,
          })
          .eq("id", campaignId)
          .eq("tenant_id", tenantId);

        return new Response(
          JSON.stringify({ success: false, error: `Cota diária atingida (${dailySendLimit}/24h).` }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (eligibleRecipients.length > remaining) {
        log.info(`[EMAIL-CAMPAIGN-SEND] Truncating recipients from ${eligibleRecipients.length} to ${remaining} due to daily limit`);
        eligibleRecipients = eligibleRecipients.slice(0, remaining);
      }
    }

    // Calculate rate limiting delay
    const sendDelayMs = maxSendsPerSecond && maxSendsPerSecond > 0
      ? Math.ceil(1000 / maxSendsPerSecond)
      : 0;

    if (sendDelayMs > 0) {
      log.info(`[EMAIL-CAMPAIGN-SEND] Rate limiting: ${maxSendsPerSecond}/s → ${sendDelayMs}ms delay between sends`);
    }

    if (suppressedSet.size > 0) {
      await supabase.from("email_campaign_logs").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        event_type: "suppression_filtered",
        event_data: {
          total_candidates: recipients.length,
          suppressed: suppressedSet.size,
          eligible: eligibleRecipients.length,
        },
        status: "info",
        is_test: false,
      });
    }

    let sentCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;

    for (let i = 0; i < eligibleRecipients.length; i++) {
      const recipient = eligibleRecipients[i];
      let logId: string | null = null;

      // Round-robin sender selection
      const currentSender = sendersList[i % sendersList.length];
      const senderConfig = {
        ...emailConfig,
        senderEmail: currentSender.email,
        senderName: currentSender.name,
      };

      try {
        const { data: tokenRow, error: tokenError } = await supabase
          .from("email_unsubscribe_tokens")
          .insert({
            tenant_id: tenantId,
            campaign_id: campaignId,
            recipient_email: recipient.email,
            recipient_name: recipient.name,
          })
          .select("id")
          .single();

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

        const result = await sendEmail(senderConfig, {
          to: recipient.email,
          subject: personalizedSubject,
          text: "Email Marketing",
          html: personalizedHtml,
        });

        const nowIso = new Date().toISOString();

        const { data: logRow } = await supabase
          .from("email_campaign_logs")
          .insert({
            tenant_id: tenantId,
            campaign_id: campaignId,
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            sender_email: currentSender.email,
            status: result.success ? "delivered" : "failed",
            error_message: result.error || null,
            sent_at: result.success ? nowIso : null,
            delivered_at: result.success ? nowIso : null,
            event_type: result.success ? "delivery_accepted" : "delivery_failed",
            event_data: {
              provider: "smtp",
              sender: currentSender.email,
              attempts: result.attempts || 1,
            },
            is_test: false,
          })
          .select("id")
          .single();

        logId = logRow?.id || null;

        if (result.success) {
          sentCount++;
          deliveredCount++;
        } else {
          failedCount++;
        }

        await supabase.from("email_events").insert({
          tenant_id: tenantId,
          campaign_id: campaignId,
          log_id: logId,
          event_type: result.success ? "delivered" : "failed",
          recipient_email: recipient.email,
          metadata: {
            reason: result.error || null,
          },
        });

        // Rate limiting delay between sends
        if (sendDelayMs > 0 && i < eligibleRecipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, sendDelayMs));
        }
      } catch (sendError: unknown) {
        failedCount++;

        await supabase.from("email_campaign_logs").insert({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_email: recipient.email,
          recipient_name: recipient.name,
          status: "failed",
          error_message: sendError?.message || "Unknown send error",
          event_type: "delivery_failed",
          event_data: { provider: "smtp", unexpected_error: true },
          is_test: false,
        });
      }
    }

    const finalStatus = sentCount === 0 && failedCount > 0 ? "error" : "sent";

    await supabase
      .from("email_campaigns")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        total_recipients: eligibleRecipients.length,
        total_sent: sentCount,
        total_delivered: deliveredCount,
        error_message:
          finalStatus === "error"
            ? "Nenhum destinatário elegível recebeu a campanha com sucesso."
            : failedCount > 0
              ? `${failedCount} envio(s) falharam.`
              : null,
      })
      .eq("id", campaignId)
      .eq("tenant_id", tenantId);

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        delivered: deliveredCount,
        failed: failedCount,
        suppressed: suppressedSet.size,
        total: eligibleRecipients.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    log.error("[EMAIL-CAMPAIGN-SEND]", error);

    if (campaignId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        await supabase
          .from("email_campaigns")
          .update({
            status: "error",
            completed_at: new Date().toISOString(),
            error_message: error?.message || "Erro inesperado no envio",
          })
          .eq("id", campaignId);
      } catch {
        // noop
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Unexpected error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
