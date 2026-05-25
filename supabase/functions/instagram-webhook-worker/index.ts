import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { processMessagingEvent } from './messaging-processor.ts';
import { processCommentEvent } from './comment-processor.ts';
import { processStoryMentionEvent, processFollowEvent, processShareToDmEvent } from './watchlist-processor.ts';
import { logEvent } from './messaging-processor.ts';

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-webhook-worker", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || Deno.env.get("INSTAGRAM_APP_SECRET")!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    requireInternalAuth(req);

    const { data: deliveries, error } = await supabase
      .from("instagram_webhook_deliveries")
      .select("id, channel_id, payload, parse_status, event_hash")
      .eq("processed", false).eq("signature_valid", true).in("parse_status", ["pending"])
      .order("created_at", { ascending: true }).limit(20);

    if (error) throw error;
    if (!deliveries || deliveries.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    log.info(`[ig-worker] Processing ${deliveries.length} deliveries`);
    let processed = 0, errors = 0;

    for (const delivery of deliveries) {
      try {
        await supabase.from("instagram_webhook_deliveries").update({ parse_status: "processing" }).eq("id", delivery.id);

        const payload = delivery.payload as Record<string, unknown>;
        const entries = (payload?.entry || []) as Record<string, unknown>[];

        for (const entry of entries) {
          const igUserId = entry.id;
          const { data: channel } = await supabase.from("instagram_channels").select("id, tenant_id, ig_user_id, access_token_encrypted").eq("ig_user_id", igUserId).maybeSingle();
          if (!channel) { log.warn(`[ig-worker] No channel for ig_user_id: ${igUserId}`); continue; }

          for (const event of (entry.messaging || []) as Record<string, unknown>[]) {
            await processMessagingEvent(supabase, channel, event as Parameters<typeof processMessagingEvent>[2], encryptionKey, log);
          }

          for (const change of (entry.changes || []) as Record<string, unknown>[]) {
            const val = change.value as Record<string, unknown>;
            if (change.field === "comments") {
              await processCommentEvent(supabase, channel, val, entry.time as number, log);
            } else if (change.field === "story_insights" || change.field === "mentions") {
              await processStoryMentionEvent(supabase, channel, val, entry.time as number, log);
            } else if (change.field === "follow") {
              await processFollowEvent(supabase, channel, val, entry.time as number, log);
            } else if (change.field === "messaging_referral" && val?.referral && (val.referral as Record<string, unknown>).source === "SHARE") {
              await processShareToDmEvent(supabase, channel, val, entry.time as number, log);
            } else {
              await logEvent(supabase, channel, { event_type: `change:${change.field}`, event_source: "webhook", event_time: new Date((entry.time as number) * 1000).toISOString(), normalized_payload: val });
            }
          }
        }

        await supabase.from("instagram_webhook_deliveries").update({ processed: true, processed_at: new Date().toISOString(), parse_status: "done" }).eq("id", delivery.id);
        processed++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error(`[ig-worker] Error processing delivery ${delivery.id}:`, errMsg);
        await supabase.from("instagram_webhook_deliveries").update({ parse_status: "error", error_message: errMsg }).eq("id", delivery.id);
        errors++;
      }
    }

    log.info(`[ig-worker] Done: ${processed} processed, ${errors} errors`);
    return new Response(JSON.stringify({ processed, errors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("[ig-worker] Fatal error:", error);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
