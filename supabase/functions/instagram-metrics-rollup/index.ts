import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-metrics-rollup", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const targetDate = body.date || new Date(Date.now() - 86400000).toISOString().split("T")[0]; // yesterday

    const { data: channels } = await supabase
      .from("instagram_channels")
      .select("id, tenant_id")
      .in("status", ["connected", "expiring"]);

    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({ rolled_up: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startOfDay = `${targetDate}T00:00:00.000Z`;
    const endOfDay = `${targetDate}T23:59:59.999Z`;
    let rolledUp = 0;

    for (const ch of channels) {
      try {
        // Get thread IDs for this channel (once, reuse for message queries)
        const { data: threadRows } = await supabase
          .from("instagram_threads")
          .select("id")
          .eq("channel_id", ch.id);
        const threadIds = (threadRows || []).map(t => t.id);

        // Count messages using pre-fetched thread IDs
        let inbound = 0, outbound = 0;
        if (threadIds.length > 0) {
          const [inboundRes, outboundRes] = await Promise.all([
            supabase
              .from("instagram_messages")
              .select("id", { count: "exact", head: true })
              .eq("direction", "inbound")
              .gte("created_at", startOfDay)
              .lte("created_at", endOfDay)
              .in("thread_id", threadIds),
            supabase
              .from("instagram_messages")
              .select("id", { count: "exact", head: true })
              .eq("direction", "outbound")
              .gte("created_at", startOfDay)
              .lte("created_at", endOfDay)
              .in("thread_id", threadIds),
          ]);
          inbound = inboundRes.count || 0;
          outbound = outboundRes.count || 0;
        }

        // New threads, events, captures, CTA clicks, failures — all in parallel
        const [newThreadsRes, eventsRes, emailsRes, phonesRes, ctaRes, failuresRes] = await Promise.all([
          supabase
            .from("instagram_threads")
            .select("id", { count: "exact", head: true })
            .eq("channel_id", ch.id)
            .gte("created_at", startOfDay)
            .lte("created_at", endOfDay),
          supabase
            .from("instagram_event_log")
            .select("event_type")
            .eq("channel_id", ch.id)
            .gte("created_at", startOfDay)
            .lte("created_at", endOfDay),
          // Emails captured — no "status" column, just count all email captures
          supabase
            .from("instagram_data_collection_events")
            .select("id", { count: "exact", head: true })
            .eq("channel_id", ch.id)
            .eq("field_name", "email")
            .gte("created_at", startOfDay)
            .lte("created_at", endOfDay),
          // Phones captured
          supabase
            .from("instagram_data_collection_events")
            .select("id", { count: "exact", head: true })
            .eq("channel_id", ch.id)
            .eq("field_name", "phone")
            .gte("created_at", startOfDay)
            .lte("created_at", endOfDay),
          // CTA clicks — table has no channel_id, filter by tenant_id instead
          supabase
            .from("instagram_cta_link_clicks")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", ch.tenant_id)
            .gte("clicked_at", startOfDay)
            .lte("clicked_at", endOfDay),
          // Send failures — filter by channel_id
          supabase
            .from("instagram_outbox")
            .select("id", { count: "exact", head: true })
            .eq("channel_id", ch.id)
            .eq("status", "dead")
            .gte("created_at", startOfDay)
            .lte("created_at", endOfDay),
        ]);

        const eventCounts: Record<string, number> = {};
        for (const e of (eventsRes.data || [])) {
          eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
        }

        await supabase.from("instagram_metrics_daily").upsert({
          tenant_id: ch.tenant_id,
          channel_id: ch.id,
          metric_date: targetDate,
          inbound_messages: inbound,
          outbound_messages: outbound,
          new_threads: newThreadsRes.count || 0,
          private_replies_sent: eventCounts["private_reply_sent"] || 0,
          flows_started: eventCounts["flow_started"] || 0,
          flows_completed: eventCounts["flow_completed"] || 0,
          handoffs_to_human: eventCounts["handoff_to_human"] || 0,
          comment_triggers: eventCounts["comment_trigger"] || 0,
          story_reply_triggers: eventCounts["story_reply_trigger"] || 0,
          story_mention_triggers: eventCounts["story_mention_trigger"] || 0,
          live_comment_triggers: eventCounts["live_comment_trigger"] || 0,
          ad_entry_triggers: eventCounts["ad_entry_trigger"] || 0,
          ref_url_entries: eventCounts["ref_url_entry"] || 0,
          send_failures: failuresRes.count || 0,
          emails_captured: emailsRes.count || 0,
          phones_captured: phonesRes.count || 0,
          cta_clicks: ctaRes.count || 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "channel_id,metric_date" });

        rolledUp++;
      } catch (e) {
        log.error(`[metrics-rollup] Error for channel ${ch.id}:`, e);
      }
    }

    log.info(`[metrics-rollup] Rolled up ${rolledUp} channels for ${targetDate}`);
    return new Response(JSON.stringify({ rolled_up: rolledUp, date: targetDate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    log.error("[metrics-rollup] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
