import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const TOKENS_PER_MESSAGE = 2;

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith("55") && cleaned.length <= 11) cleaned = "55" + cleaned;
  return cleaned;
}

/**
 * Check if current time (in campaign timezone) falls within the sending schedule.
 * Returns true if no schedule is set or if currently within a valid window.
 */
function isWithinSendingWindow(
  schedule: Record<string, { start: string; end: string }> | null,
  tz: string | null
): boolean {
  if (!schedule || Object.keys(schedule).length === 0) return true;

  const timezone = tz || "America/Sao_Paulo";
  // Get current time in the campaign's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekdayStr = parts.find(p => p.type === "weekday")?.value || "";
  const hour = parts.find(p => p.type === "hour")?.value || "00";
  const minute = parts.find(p => p.type === "minute")?.value || "00";
  const currentTime = `${hour}:${minute}`;

  // Map weekday name to JS day number (0=Sun)
  const dayMap: Record<string, string> = {
    Sun: "0", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6",
  };
  const dayKey = dayMap[weekdayStr];
  if (!dayKey) return true;

  const window = schedule[dayKey];
  if (!window) return false; // Day not in schedule = no sending

  return currentTime >= window.start && currentTime < window.end;
}

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("bulk-campaign-processor", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUserOrInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiUrl || !evolutionApiKey) {
      return new Response(JSON.stringify({ error: "Evolution API not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // IDOR protection: validate campaign belongs to user's tenant on user calls
    if (!auth.isInternal && auth.tenantId) {
      await requireResource(supabase, "bulk_campaigns", campaign_id, auth.tenantId, req);
    }

    // Load campaign
    const { data: campaign, error: campErr } = await supabase
      .from("bulk_campaigns")
      .select("id, tenant_id, name, status, message_template, whatsapp_integration_id, media_url, media_type, delay_seconds, delay_max_seconds, sent_count, failed_count, total_tokens_used, timezone, sending_schedule")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (campaign.status !== "processing") {
      return new Response(JSON.stringify({ error: "Campaign not in processing state" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== CONCURRENCY LOCK =====
    // Atomically try to acquire the processing lock. If another invocation already
    // holds the lock OR if next_send_at is still in the future, skip silently.
    // This prevents the scheduler (cron) and the self-reinvocation from sending
    // multiple messages in parallel and breaking the configured interval.
    const minDelay = campaign.delay_seconds || 120;
    const maxDelay = campaign.delay_max_seconds || 360;
    // Lock must outlive the worst-case delay so no concurrent invocation
    // (scheduler cron or accidental re-invoke) can break the interval.
    const lockSeconds = Math.max(120, maxDelay + 60);
    const { data: lockAcquired } = await supabase.rpc("try_acquire_bulk_campaign_lock", {
      _campaign_id: campaign_id,
      _lock_seconds: lockSeconds,
    });

    if (!lockAcquired) {
      log.info(`🔒 Skipping ${campaign_id} — another invocation is active or next_send_at is in the future.`);
      return new Response(JSON.stringify({ success: true, skipped: "locked_or_throttled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get WhatsApp integration
    const { data: integration } = await supabase
      .from("integrations")
      .select("metadata")
      .eq("id", campaign.whatsapp_integration_id)
      .single();

    const instanceName = (integration?.metadata as Record<string, string> | null)?.instanceName;
    if (!instanceName) {
      await supabase.from("bulk_campaigns").update({ status: "cancelled" }).eq("id", campaign_id);
      return new Response(JSON.stringify({ error: "WhatsApp instance not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get pending contacts
    const { data: contacts, error: conErr } = await supabase
      .from("campaign_contacts")
      .select("id, campaign_id, phone, name, variables, status")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1); // Process 1 contact per invocation to avoid 150s timeout

    if (conErr) throw conErr;

    if (!contacts || contacts.length === 0) {
      // Also check for stuck "sending" contacts and reset them
      const { count: stuckCount } = await supabase
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .eq("status", "sending");

      if (stuckCount && stuckCount > 0) {
        log.warn(`🔄 Found ${stuckCount} stuck 'sending' contacts, resetting to 'pending'`);
        await supabase.from("campaign_contacts")
          .update({ status: "pending" })
          .eq("campaign_id", campaign_id)
          .eq("status", "sending");
        // Re-invoke self to process them
        const functionUrl = `${supabaseUrl}/functions/v1/bulk-campaign-processor`;
        fetch(functionUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ campaign_id }),
        }).catch(e => log.error("Background error", { error: String(e) }));
        return new Response(JSON.stringify({ success: true, message: "Reset stuck contacts, reprocessing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // All done
      await supabase.from("bulk_campaigns").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", campaign_id);

      return new Response(JSON.stringify({ success: true, message: "Campaign completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = evolutionApiUrl.replace(/\/$/, "");
    let sentCount = 0;
    let failedCount = 0;
    let stoppedByWindow = false;

    for (const contact of contacts) {
      // Check if campaign was paused
      const { data: currentCampaign } = await supabase
        .from("bulk_campaigns")
        .select("status")
        .eq("id", campaign_id)
        .single();

      if (currentCampaign?.status !== "processing") {
        log.info("⏸️ Campaign paused or cancelled, stopping processing");
        break;
      }

      // Check sending schedule window
      const sendingSchedule = campaign.sending_schedule as Record<string, { start: string; end: string }> | null;
      if (!isWithinSendingWindow(sendingSchedule, campaign.timezone)) {
        log.info("🕐 Outside sending window, stopping. Scheduler will resume when window opens.");
        stoppedByWindow = true;
        break;
      }

      // Check tokens
      const { data: hasTokens } = await supabase.rpc("has_enough_tokens", {
        _tenant_id: campaign.tenant_id,
        _amount: TOKENS_PER_MESSAGE,
      });

      if (!hasTokens) {
        log.warn("⚠️ Insufficient tokens, pausing campaign");
        await supabase.from("bulk_campaigns").update({ status: "paused" }).eq("id", campaign_id);
        break;
      }

      // Update status to sending
      await supabase.from("campaign_contacts").update({ status: "sending" }).eq("id", contact.id);

      // Replace variables in message
      let message = campaign.message_template;
      const variables = (contact.variables || {}) as Record<string, string>;
      const contactName = contact.name || "";
      message = message.replace(/{nome}/gi, contactName);
      message = message.replace(/{primeiro_nome}/gi, contactName.split(/\s+/)[0] || "");
      for (const [key, val] of Object.entries(variables)) {
        if (key === "nome" || key === "primeiro_nome") continue;
        message = message.replace(new RegExp(`\\{${key}\\}`, "gi"), String(val));
      }

      const formattedPhone = formatPhoneNumber(contact.phone);
      const hasMedia = campaign.media_url && campaign.media_type && campaign.media_type !== "text";

      try {
        let response: Response;

        if (hasMedia) {
          // Determine Evolution API endpoint based on media type
          const mediaTypeMap: Record<string, string> = {
            image: "sendMedia",
            video: "sendMedia",
            audio: "sendWhatsAppAudio",
            document: "sendMedia",
          };
          const endpoint = mediaTypeMap[campaign.media_type] || "sendMedia";

          response = await fetch(`${baseUrl}/message/${endpoint}/${instanceName}`, {
            method: "POST",
            headers: {
              apikey: evolutionApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              number: formattedPhone,
              mediatype: campaign.media_type === "audio" ? "audio" : campaign.media_type,
              media: campaign.media_url,
              caption: message || undefined,
              fileName: campaign.media_type === "document" ? "documento" : undefined,
            }),
          });
        } else {
          response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
            method: "POST",
            headers: {
              apikey: evolutionApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              number: formattedPhone,
              text: message,
            }),
          });
        }

        const result = await response.json();

        if (response.ok) {
          const whatsappMessageId = result.key?.id || result.messageId;
          await supabase.from("campaign_contacts").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            whatsapp_message_id: whatsappMessageId,
          }).eq("id", contact.id);

          // Deduct tokens
          await supabase.rpc("deduct_tokens", {
            _tenant_id: campaign.tenant_id,
            _amount: TOKENS_PER_MESSAGE,
            _type: "bulk_campaign",
            _description: `Disparo em massa: ${campaign.name}`,
            _reference_id: contact.id,
          });

          sentCount++;
          log.info(`✅ Sent to ${formattedPhone}`);

          // Update campaign stats immediately after each successful send
          await supabase.from("bulk_campaigns").update({
            sent_count: (campaign.sent_count || 0) + sentCount,
            failed_count: (campaign.failed_count || 0) + failedCount,
            total_tokens_used: (campaign.total_tokens_used || 0) + sentCount * TOKENS_PER_MESSAGE,
          }).eq("id", campaign_id);
        } else {
          await supabase.from("campaign_contacts").update({
            status: "failed",
            error_message: JSON.stringify(result).substring(0, 500),
          }).eq("id", contact.id);
        failedCount++;
        log.error(`❌ Failed for ${formattedPhone}:`, result);

          // Update campaign stats immediately after each failure
          await supabase.from("bulk_campaigns").update({
            sent_count: (campaign.sent_count || 0) + sentCount,
            failed_count: (campaign.failed_count || 0) + failedCount,
            total_tokens_used: (campaign.total_tokens_used || 0) + sentCount * TOKENS_PER_MESSAGE,
          }).eq("id", campaign_id);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        await supabase.from("campaign_contacts").update({
          status: "failed",
          error_message: errMsg.substring(0, 500),
        }).eq("id", contact.id);
        failedCount++;
        log.error(`❌ Error for ${formattedPhone}:`, errMsg);

        // Update campaign stats immediately after each error
        await supabase.from("bulk_campaigns").update({
          sent_count: (campaign.sent_count || 0) + sentCount,
          failed_count: (campaign.failed_count || 0) + failedCount,
          total_tokens_used: (campaign.total_tokens_used || 0) + sentCount * TOKENS_PER_MESSAGE,
        }).eq("id", campaign_id);
      }

      // Delay is now applied between invocations (see below), not inside the request,
      // to avoid the 150s edge function idle timeout.
    }

    // Check if more contacts remain
    const { count: remaining } = await supabase
      .from("campaign_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    // Also count stuck "sending" contacts
    const { count: stuckRemaining } = await supabase
      .from("campaign_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "sending");

    const totalRemaining = (remaining || 0) + (stuckRemaining || 0);

    if (totalRemaining > 0) {
      // Reset any stuck "sending" contacts
      if (stuckRemaining && stuckRemaining > 0) {
        await supabase.from("campaign_contacts")
          .update({ status: "pending" })
          .eq("campaign_id", campaign_id)
          .eq("status", "sending");
      }

      if (stoppedByWindow) {
        log.info(`📋 ${totalRemaining} contacts remaining, waiting for sending window to resume`);
        // Release lock so the scheduler can pick it up when the window opens.
        await supabase.rpc("release_bulk_campaign_lock", {
          _campaign_id: campaign_id,
          _next_send_seconds: 60,
        });
      } else {
        // Schedule next batch in background after the humanized delay,
        // without blocking the current response (avoids 150s idle timeout).
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        log.info(`📋 ${totalRemaining} remaining. Next batch in ${randomDelay}s`);

        // Release the lock and set next_send_at so the cron scheduler does NOT
        // re-invoke before this delay has elapsed (prevents parallel sends).
        await supabase.rpc("release_bulk_campaign_lock", {
          _campaign_id: campaign_id,
          _next_send_seconds: randomDelay,
        });

        const functionUrl = `${supabaseUrl}/functions/v1/bulk-campaign-processor`;
        const scheduleNext = async () => {
          try {
            await new Promise((resolve) => setTimeout(resolve, randomDelay * 1000));
            await fetch(functionUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ campaign_id }),
            });
          } catch (e) {
            log.error("Background re-invoke error", { error: String(e) });
          }
        };
        // EdgeRuntime.waitUntil keeps the worker alive after the response is sent
        const er = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
        if (er?.waitUntil) {
          er.waitUntil(scheduleNext());
        } else {
          scheduleNext();
        }
      }
    } else {
      // All processed — release lock and mark completed
      await supabase.from("bulk_campaigns").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        processing_lock_until: null,
        next_send_at: null,
      }).eq("id", campaign_id);
      log.info("🎉 Campaign completed!");
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, failed: failedCount, remaining: remaining || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    log.error("❌ Bulk campaign error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
