import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-trigger-dispatcher", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { event_type, channel_id, thread_id, contact_id, tenant_id, message_text, message_id } = await req.json();
    if (!event_type || !channel_id || !thread_id || !contact_id || !tenant_id) {
      throw new Error("Missing required fields");
    }

    // Check contact pauses
    const { data: pauses } = await supabase
      .from("instagram_contact_pauses")
      .select("id, paused_until")
      .eq("contact_id", contact_id)
      .eq("channel_id", channel_id);

    const now = new Date();
    const activePause = (pauses || []).find((p: { paused_until?: string | null }) => !p.paused_until || new Date(p.paused_until) > now);
    if (activePause) {
      log.info(`[trigger-dispatcher] Contact ${contact_id} has active pause, skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: "contact_paused" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check thread-level pause
    const { data: thread } = await supabase
      .from("instagram_threads")
      .select("automations_paused_until")
      .eq("id", thread_id)
      .single();
    if (thread?.automations_paused_until && new Date(thread.automations_paused_until) > now) {
      log.info(`[trigger-dispatcher] Thread ${thread_id} paused, skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: "thread_paused" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map event to trigger types
    let triggerTypes: string[] = [];
    if (event_type === "message_received") {
      triggerTypes = ["dm_any_message", "dm_keyword"];
    } else if (event_type === "no_reply_timeout") {
      triggerTypes = ["no_reply_timeout"];
    } else if (event_type === "business_hours_open") {
      triggerTypes = ["business_hours_open"];
    } else if (event_type === "manual_start") {
      triggerTypes = ["manual_start"];
    } else if (event_type === "post_comment") {
      triggerTypes = ["post_comment"];
    } else if (event_type === "reel_comment") {
      triggerTypes = ["reel_comment"];
    } else if (event_type === "live_comment") {
      triggerTypes = ["live_comment"];
    } else if (event_type === "story_reply") {
      triggerTypes = ["story_reply"];
    } else if (event_type === "story_mention") {
      triggerTypes = ["story_mention"];
    } else if (event_type === "ad_welcome") {
      triggerTypes = ["ad_welcome"];
    } else if (event_type === "ice_breaker_click") {
      triggerTypes = ["ice_breaker_click"];
    } else if (event_type === "persistent_menu_click") {
      triggerTypes = ["persistent_menu_click"];
    } else if (event_type === "ref_url_entry") {
      triggerTypes = ["ref_url_entry"];
    } else if (event_type === "follow_to_dm") {
      triggerTypes = ["follow_to_dm"];
    } else if (event_type === "share_to_dm") {
      triggerTypes = ["share_to_dm"];
    }

    if (triggerTypes.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_matching_trigger_type" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch matching rules
    const { data: rules } = await supabase
      .from("instagram_trigger_rules")
      .select("*, flow:instagram_flows!inner(id, live_version_id, status, allow_parallel_runs, channel_id)")
      .in("trigger_type", triggerTypes)
      .eq("is_active", true)
      .eq("flow.channel_id", channel_id)
      .eq("flow.status", "active")
      .order("priority", { ascending: false });

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ ok: true, matched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let triggered = 0;

    for (const rule of rules) {
      const flow = rule.flow as { id: string; live_version_id: string | null; status: string; allow_parallel_runs: boolean; channel_id: string };
      if (!flow?.live_version_id) continue;

      // Keyword check
      if (rule.trigger_type === "dm_keyword" && rule.keywords?.length > 0 && message_text) {
        const text = message_text.toLowerCase().trim();
        const match = rule.keywords.some((kw: string) => {
          if (rule.keyword_match_mode === "contains") return text.includes(kw.toLowerCase());
          if (rule.keyword_match_mode === "regex") {
            try { return new RegExp(kw, "i").test(text); } catch { return false; }
          }
          return text === kw.toLowerCase();
        });
        if (!match) continue;
      }

      // Time filter
      if (rule.time_filter) {
        const tf = rule.time_filter as { days?: number[]; start_time?: string; end_time?: string };
        const nowLocal = new Date();
        const day = nowLocal.getDay();
        if (tf.days && !tf.days.includes(day)) continue;
        if (tf.start_time && tf.end_time) {
          const hhmm = `${String(nowLocal.getHours()).padStart(2, "0")}:${String(nowLocal.getMinutes()).padStart(2, "0")}`;
          if (hhmm < tf.start_time || hhmm > tf.end_time) continue;
        }
      }

      // Throttle check
      if (rule.throttle_mode !== "always") {
        const window = rule.throttle_mode === "once_per_24h"
          ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          : "1970-01-01T00:00:00Z";

        const { count } = await supabase
          .from("instagram_flow_runs")
          .select("id", { count: "exact", head: true })
          .eq("flow_id", flow.id)
          .eq("contact_id", contact_id)
          .eq("trigger_rule_id", rule.id)
          .gte("created_at", window);

        if ((count || 0) > 0) continue;
      }

      // Parallel runs check
      if (!flow.allow_parallel_runs) {
        const { count } = await supabase
          .from("instagram_flow_runs")
          .select("id", { count: "exact", head: true })
          .eq("flow_id", flow.id)
          .eq("contact_id", contact_id)
          .eq("status", "running");

        if ((count || 0) > 0) continue;
      }

      // Tag filter
      if (rule.tag_filter_ids?.length > 0) {
        const { data: contactTags } = await supabase
          .from("instagram_contact_tags")
          .select("tag_id")
          .eq("contact_id", contact_id);
        const contactTagIds = new Set((contactTags || []).map((t: { tag_id: string }) => t.tag_id));
        const hasAll = rule.tag_filter_ids.every((id: string) => contactTagIds.has(id));
        if (!hasAll) continue;
      }

      // Create idempotency key
      const idempKey = `${flow.id}:${contact_id}:${message_id || event_type}:${rule.id}`;

      // Create run
      const { data: run, error: runErr } = await supabase
        .from("instagram_flow_runs")
        .insert({
          tenant_id,
          flow_id: flow.id,
          version_id: flow.live_version_id,
          thread_id,
          contact_id,
          trigger_rule_id: rule.id,
          status: "running",
          idempotency_key: idempKey,
          context: { message_text, event_type, channel_id },
        })
        .select("id")
        .single();

      if (runErr) {
        if (runErr.code === "23505") {
          log.info(`[trigger-dispatcher] Duplicate run skipped: ${idempKey}`);
          continue;
        }
        log.error(`[trigger-dispatcher] Error creating run:`, runErr);
        continue;
      }

      // Invoke flow runner
      await supabase.functions.invoke("instagram-flow-runner", {
        body: { run_id: run.id },
      });

      triggered++;
      break; // Only trigger first matching rule (highest priority)
    }

    return new Response(JSON.stringify({ ok: true, matched: rules.length, triggered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[trigger-dispatcher] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
