import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { isCircuitClosed, recordSuccess, recordFailure } from "../_shared/circuit-breaker.ts";
import { sendToDeadLetter } from "../_shared/dead-letter.ts";
import { recordMetrics, startTimer } from "../_shared/metrics.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";

const MAX_ATTEMPTS = 5;
const FUNCTION_NAME = "instagram-outbox-dispatch";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = getCorrelationId(req);
  const log = createLogger(FUNCTION_NAME, correlationId);
  const elapsed = startTimer();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    requireInternalAuth(req);

    const { data: items, error } = await supabase
      .from("instagram_outbox")
      .select("*, contact:instagram_contacts(igsid), channel:instagram_channels(id, access_token_encrypted, ig_user_id, status)")
      .in("status", ["pending", "retry"])
      .lte("send_after", new Date().toISOString())
      .lt("attempt_count", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) throw error;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log.info(`Processing ${items.length} items`);
    let sent = 0, failed = 0, dead = 0;

    for (const item of items) {
      try {
        await supabase.from("instagram_outbox").update({ status: "sending" }).eq("id", item.id);

        const channel = item.channel as { id: string; access_token_encrypted: string; ig_user_id: string; status: string } | null;
        const contact = item.contact as { igsid: string } | null;

        if (!channel || !["connected", "expiring", "error"].includes(channel.status)) {
          throw new Error("Channel not connected");
        }
        if (!contact?.igsid) throw new Error("Contact IGSID not found");

        // Circuit breaker check
        const circuitConfig = { provider: "instagram_api", tenantId: item.tenant_id };
        const circuitOk = await isCircuitClosed(circuitConfig);
        if (!circuitOk) {
          log.warn("Circuit open, deferring", { itemId: item.id });
          await supabase.from("instagram_outbox").update({
            status: "retry",
            send_after: new Date(Date.now() + 30000).toISOString(),
            error_message: "Circuit breaker open",
          }).eq("id", item.id);
          failed++;
          continue;
        }

        const { accessToken, host } = await resolveInstagramAccessToken(channel.access_token_encrypted);
        const payload = item.payload as { text?: string; sent_by_user_id?: string };
        const igUserId = channel.ig_user_id;

        const messageBody = JSON.stringify({
          recipient: { id: contact.igsid },
          message: { text: payload.text },
        });

        const sendAttempts = host === "graph.instagram.com"
          ? [
              { url: `https://graph.instagram.com/v21.0/me/messages` },
              { url: `https://graph.instagram.com/v21.0/${igUserId}/messages` },
              { url: `https://graph.facebook.com/v21.0/${igUserId}/messages` },
            ]
          : [
              { url: `https://graph.facebook.com/v21.0/${igUserId}/messages` },
              { url: `https://graph.facebook.com/v21.0/me/messages` },
              { url: `https://graph.instagram.com/v21.0/me/messages` },
              { url: `https://graph.instagram.com/v21.0/${igUserId}/messages` },
            ];

        let result: Record<string, unknown> | null = null;
        let sentOk = false;
        let lastApiError = "Unknown API error";

        for (let i = 0; i < sendAttempts.length; i++) {
          const attempt = sendAttempts[i];
          log.info(`Attempt ${i + 1}/${sendAttempts.length}`, { url: attempt.url.replace(/access_token=[^&]+/, 'access_token=***') });

          const response = await fetch(attempt.url, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: messageBody,
          });

          result = await response.json().catch(() => ({}));

          if (response.ok && !result?.error) {
            sentOk = true;
            break;
          }

          lastApiError = result?.error?.message || `API error ${response.status}`;
          if (result?.error?.type === "OAuthException" && result?.error?.code === 190) continue;
        }

        if (!sentOk) throw new Error(lastApiError);

        await recordSuccess(circuitConfig);

        const providerMsgId = result.message_id || result.id;

        await supabase.from("instagram_outbox").update({
          status: "sent",
          provider_message_id: providerMsgId,
          last_attempt_at: new Date().toISOString(),
          attempt_count: (item.attempt_count || 0) + 1,
        }).eq("id", item.id);

        if (providerMsgId) {
          await supabase
            .from("instagram_messages")
            .update({ delivery_status: "sent", provider_message_id: providerMsgId })
            .eq("thread_id", item.thread_id)
            .eq("direction", "outbound")
            .eq("delivery_status", "pending")
            .order("created_at", { ascending: false })
            .limit(1);
        }

        log.info(`Sent`, { itemId: item.id, providerMsgId });
        sent++;
      } catch (err: unknown) {
        const newAttempts = (item.attempt_count || 0) + 1;
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorCode = err instanceof Error ? (err as Error & { code?: string }).code || null : null;

        // Record circuit breaker failure
        await recordFailure({ provider: "instagram_api", tenantId: item.tenant_id }, errorMsg);

        if (newAttempts >= MAX_ATTEMPTS) {
          await supabase.from("instagram_outbox").update({
            status: "dead", attempt_count: newAttempts, last_attempt_at: new Date().toISOString(),
            error_code: errorCode, error_message: errorMsg,
          }).eq("id", item.id);

          await supabase.from("instagram_messages")
            .update({ delivery_status: "failed", error_code: errorCode, error_message: errorMsg })
            .eq("thread_id", item.thread_id).eq("direction", "outbound").eq("delivery_status", "pending")
            .order("created_at", { ascending: false }).limit(1);

          await sendToDeadLetter({
            tenant_id: item.tenant_id,
            source_queue: "instagram_outbox",
            source_item_id: item.id,
            channel_type: "instagram",
            channel_id: (item.channel as Record<string, unknown>)?.id,
            destination: (item.contact as Record<string, unknown>)?.igsid || "unknown",
            payload: (item.payload as Record<string, unknown>) || {},
            error_message: errorMsg,
            error_code: errorCode || undefined,
            attempts: newAttempts,
            correlation_id: correlationId,
          });

          log.error(`Dead letter`, { itemId: item.id, attempts: newAttempts, error: errorMsg });
          dead++;
        } else {
          const backoffSeconds = 10 * Math.pow(3, newAttempts - 1);
          const sendAfter = new Date(Date.now() + backoffSeconds * 1000).toISOString();

          await supabase.from("instagram_outbox").update({
            status: "retry", attempt_count: newAttempts, send_after: sendAfter,
            last_attempt_at: new Date().toISOString(), error_code: errorCode, error_message: errorMsg,
          }).eq("id", item.id);

          log.warn(`Retry scheduled`, { itemId: item.id, attempt: newAttempts, sendAfter });
          failed++;
        }
      }
    }

    log.info(`Results`, { sent, failed, dead });

    await recordMetrics({
      functionName: FUNCTION_NAME,
      correlationId,
      status: dead > 0 ? "error" : "ok",
      durationMs: elapsed(),
      itemsProcessed: sent,
      itemsFailed: failed,
      itemsDead: dead,
    });

    return new Response(JSON.stringify({ sent, failed, dead, correlationId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("Fatal error", { error: errMsg });

    await recordMetrics({
      functionName: FUNCTION_NAME,
      correlationId,
      status: "error",
      durationMs: elapsed(),
      errorMessage: errMsg,
    });

    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
