import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";

/**
 * Send a DM directly via Meta API, bypassing instagram-send-message window checks.
 * This is necessary for follow_to_dm because new followers don't have an open
 * messaging window yet.
 */
async function sendDirectMetaDM(
  accessToken: string,
  host: string,
  igUserId: string,
  recipientIgsid: string,
  text: string,
  log: ReturnType<typeof createLogger>,
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const apiVersion = "v21.0";
  const url = `https://${host}/${apiVersion}/${igUserId}/messages`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientIgsid },
      message: { text },
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.error) {
    const errMsg = data?.error?.message || `HTTP ${resp.status}`;
    log.error(`[direct-dm] Meta API error: ${errMsg}`, data?.error);
    return { ok: false, error: errMsg };
  }

  return { ok: true, messageId: data?.message_id };
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-experimental-trigger", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { channel_id, contact_id, tenant_id, event_type } = await req.json();
    if (!channel_id || !contact_id || !tenant_id) throw new Error("Missing required fields");

    const type = event_type || "follow_to_dm";

    // Check capability
    const { data: caps } = await supabase
      .from("instagram_channel_capabilities")
      .select("follow_to_dm, share_to_dm")
      .eq("channel_id", channel_id)
      .maybeSingle();

    if (!caps) throw new Error("Channel capabilities not found");

    if (type === "follow_to_dm" && !caps.follow_to_dm) {
      return new Response(JSON.stringify({ ok: false, error: "follow_to_dm not supported" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (type === "share_to_dm" && !caps.share_to_dm) {
      return new Response(JSON.stringify({ ok: false, error: "share_to_dm not supported" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check feature flag
    const { data: flag } = await supabase
      .from("instagram_feature_flags")
      .select("is_enabled")
      .eq("channel_id", channel_id)
      .eq("feature_key", type)
      .maybeSingle();

    if (!flag?.is_enabled) {
      return new Response(JSON.stringify({ ok: false, error: `Feature ${type} not enabled` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "follow_to_dm") {
      // Get config
      const { data: config } = await supabase
        .from("instagram_follow_dm_configs")
        .select("id, channel_id, is_active, once_per_user, delay_seconds, flow_id, welcome_text")
        .eq("channel_id", channel_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!config) {
        return new Response(JSON.stringify({ ok: true, skipped: "no_active_config" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Dedup: once per user
      if (config.once_per_user) {
        const { data: existing } = await supabase
          .from("instagram_experimental_executions")
          .select("id")
          .eq("channel_id", channel_id)
          .eq("contact_id", contact_id)
          .eq("execution_type", "follow_to_dm")
          .eq("config_id", config.id)
          .maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({ ok: true, skipped: "already_executed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Delay
      if (config.delay_seconds > 0) {
        await new Promise(r => setTimeout(r, config.delay_seconds * 1000));
      }

      // Get channel data for direct Meta send
      const { data: channelData } = await supabase
        .from("instagram_channels")
        .select("ig_user_id, access_token_encrypted")
        .eq("id", channel_id)
        .single();

      if (!channelData) throw new Error("Channel not found");

      // Get contact IGSID
      const { data: contact } = await supabase
        .from("instagram_contacts")
        .select("igsid")
        .eq("id", contact_id)
        .single();

      if (!contact?.igsid) throw new Error("Contact IGSID not found");

      let sendResult = { ok: false, error: "No send method configured" };

      if (config.flow_id) {
        // Flow-based: get or create thread, dispatch flow
        const thread = await getOrCreateThread(supabase, channel_id, contact_id, tenant_id);
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await fetch(`${supabaseUrl}/functions/v1/instagram-trigger-dispatcher`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            event_type: "follow_to_dm",
            channel_id,
            thread_id: thread.id,
            contact_id,
            tenant_id,
          }),
        });
        sendResult = { ok: true };
      } else if (config.welcome_text) {
        // Direct Meta API send — bypasses window check
        const { accessToken, host } = await resolveInstagramAccessToken(channelData.access_token_encrypted);
        
        const result = await sendDirectMetaDM(
          accessToken, host, channelData.ig_user_id,
          contact.igsid, config.welcome_text, log,
        );

        if (result.ok) {
          // Ensure thread + message record exist for tracking
          const thread = await getOrCreateThread(supabase, channel_id, contact_id, tenant_id);
          await supabase.from("instagram_messages").insert({
            tenant_id,
            thread_id: thread.id,
            direction: "outbound",
            message_type: "text",
            text_body: config.welcome_text,
            delivery_status: "sent",
            ig_message_id: result.messageId || null,
          });
          // Update thread preview
          await supabase.from("instagram_threads").update({
            last_message_preview: config.welcome_text.substring(0, 200),
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", thread.id);
        }

        sendResult = result;
      }

      // Log execution
      await supabase.from("instagram_experimental_executions").insert({
        tenant_id,
        channel_id,
        contact_id,
        execution_type: "follow_to_dm",
        config_id: config.id,
      });

      if (!sendResult.ok) {
        log.error(`[follow_to_dm] Send failed: ${sendResult.error}`);
      } else {
        log.info(`[follow_to_dm] ✅ DM sent to contact ${contact_id}`);
      }

      return new Response(JSON.stringify({ ok: sendResult.ok, type: "follow_to_dm", error: sendResult.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === share_to_dm ===
    const { data: configs } = await supabase
      .from("instagram_share_dm_configs")
      .select("id, channel_id, is_active, once_per_user_per_automation, flow_id")
      .eq("channel_id", channel_id)
      .eq("is_active", true);

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_active_config" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shareConfig = configs[0];

    if (shareConfig.once_per_user_per_automation) {
      const { data: existing } = await supabase
        .from("instagram_experimental_executions")
        .select("id")
        .eq("channel_id", channel_id)
        .eq("contact_id", contact_id)
        .eq("execution_type", "share_to_dm")
        .eq("config_id", shareConfig.id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ ok: true, skipped: "already_executed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (shareConfig.flow_id) {
      const thread = await getOrCreateThread(supabase, channel_id, contact_id, tenant_id);
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      await fetch(`${supabaseUrl}/functions/v1/instagram-trigger-dispatcher`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          event_type: "share_to_dm",
          channel_id,
          thread_id: thread.id,
          contact_id,
          tenant_id,
        }),
      });
    }

    await supabase.from("instagram_experimental_executions").insert({
      tenant_id,
      channel_id,
      contact_id,
      execution_type: "share_to_dm",
      config_id: shareConfig.id,
    });

    return new Response(JSON.stringify({ ok: true, type: "share_to_dm" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[experimental-trigger] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Get or create thread for a contact. New followers may not have a thread yet.
 */
async function getOrCreateThread(
  supabase: ReturnType<typeof createClient>,
  channelId: string,
  contactId: string,
  tenantId: string,
): Promise<{ id: string }> {
  const { data: existing } = await supabase
    .from("instagram_threads")
    .select("id")
    .eq("channel_id", channelId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (existing) return existing;

  // Create a new thread
  const { data: newThread, error } = await supabase
    .from("instagram_threads")
    .insert({
      tenant_id: tenantId,
      channel_id: channelId,
      contact_id: contactId,
      thread_status: "active",
      current_mode: "bot",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create thread: ${error.message}`);
  return newThread;
}
