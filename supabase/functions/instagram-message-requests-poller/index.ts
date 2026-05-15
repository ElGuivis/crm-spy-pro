import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

interface IgChannel {
  id: string;
  tenant_id: string;
  ig_user_id: string;
  access_token_encrypted: string;
}

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-message-requests-poller", cid);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    requireInternalAuth(req);

    const { data: channels, error: chErr } = await supabase
      .from("instagram_channels")
      .select("id, tenant_id, ig_user_id, access_token_encrypted")
      .eq("status", "connected");

    if (chErr) throw chErr;
    if (!channels?.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalProcessed = 0;

    for (const channel of channels) {
      try {
        const { accessToken } = await resolveInstagramAccessToken(channel.access_token_encrypted);

        // Only fetch conversations updated in the last 24h (Meta messaging window)
        const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
        const url =
          `https://graph.facebook.com/v21.0/${channel.ig_user_id}/conversations` +
          `?folder=pending` +
          `&fields=id,participants,messages{id,message,created_time,from}` +
          `&since=${since}` +
          `&limit=50` +
          `&access_token=${encodeURIComponent(accessToken)}`;

        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.text();
          log.warn(`[poller] conversations API error for channel ${channel.id}: HTTP ${res.status}`, err);
          continue;
        }

        const body = await res.json();
        const conversations: Record<string, unknown>[] = body.data || [];
        log.info(`[poller] channel ${channel.ig_user_id}: ${conversations.length} pending conversations`);

        for (const conv of conversations) {
          try {
            await processConversation(supabase, channel, conv, accessToken, supabaseUrl, serviceKey, log);
            totalProcessed++;
          } catch (err: unknown) {
            log.error(`[poller] error processing conv ${conv.id}:`, err instanceof Error ? err.message : err);
          }
        }
      } catch (err: unknown) {
        log.error(`[poller] error on channel ${channel.id}:`, err instanceof Error ? err.message : err);
      }
    }

    log.info(`[poller] done, totalProcessed=${totalProcessed}`);
    return new Response(JSON.stringify({ processed: totalProcessed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    log.error("[poller] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processConversation(
  supabase: ReturnType<typeof createClient>,
  channel: IgChannel,
  conv: Record<string, unknown>,
  accessToken: string,
  supabaseUrl: string,
  serviceKey: string,
  log: ReturnType<typeof createLogger>,
) {
  const convId = conv.id as string;

  // Find the sender (participant that is not the business account)
  const participants = (conv.participants as { data?: { id: string }[] })?.data || [];
  const sender = participants.find((p) => p.id !== channel.ig_user_id);
  if (!sender) {
    log.warn(`[poller] no sender found in conv ${convId}`);
    return;
  }
  const contactIgsid = sender.id;

  const now = new Date().toISOString();
  const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Upsert contact
  let contactId: string;
  const { data: existingContact } = await supabase
    .from("instagram_contacts")
    .select("id")
    .eq("channel_id", channel.id)
    .eq("igsid", contactIgsid)
    .maybeSingle();

  if (existingContact) {
    contactId = existingContact.id;
    await supabase.from("instagram_contacts").update({
      last_seen_at: now,
      last_user_interaction_at: now,
      standard_window_expires_at: windowExpires,
      updated_at: now,
    }).eq("id", contactId);
  } else {
    // Fetch profile from Graph API
    let displayName: string | null = null;
    let username: string | null = null;
    let profilePic: string | null = null;
    try {
      const profileRes = await fetch(
        `https://graph.instagram.com/v21.0/${contactIgsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(accessToken)}`
      );
      if (profileRes.ok) {
        const p = await profileRes.json();
        displayName = p.name || p.username || null;
        username = p.username || null;
        profilePic = p.profile_pic || null;
      }
    } catch { /* optional */ }

    const { data: newContact, error: insertErr } = await supabase
      .from("instagram_contacts")
      .insert({
        tenant_id: channel.tenant_id,
        channel_id: channel.id,
        igsid: contactIgsid,
        display_name: displayName,
        instagram_username: username,
        profile_pic_url: profilePic,
        first_seen_at: now,
        last_seen_at: now,
        last_user_interaction_at: now,
        standard_window_expires_at: windowExpires,
        source_first_entry: "message_request",
      })
      .select("id")
      .single();

    if (insertErr || !newContact) {
      log.error(`[poller] failed to create contact for igsid ${contactIgsid}:`, insertErr?.message);
      return;
    }
    contactId = newContact.id;
    log.info(`[poller] created contact ${contactId} (@${username || contactIgsid})`);
  }

  // Get latest message from conversation
  const messages = (conv.messages as { data?: { id: string; message?: string; created_time?: string }[] })?.data || [];
  const latestMsg = messages[0];
  const msgText = latestMsg?.message || null;
  const msgTime = latestMsg?.created_time ? new Date(latestMsg.created_time).toISOString() : now;

  // Upsert thread
  let threadId: string;
  const { data: existingThread } = await supabase
    .from("instagram_threads")
    .select("id, provider_thread_id")
    .eq("channel_id", channel.id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (existingThread) {
    threadId = existingThread.id;
    const threadUpdate: Record<string, string | null> = {
      last_message_at: msgTime,
      updated_at: now,
    };
    if (!existingThread.provider_thread_id) {
      threadUpdate.provider_thread_id = convId;
    }
    if (msgText) threadUpdate.last_message_preview = msgText.substring(0, 200);
    await supabase.from("instagram_threads").update(threadUpdate).eq("id", threadId);
  } else {
    const { data: newThread, error: threadErr } = await supabase
      .from("instagram_threads")
      .insert({
        tenant_id: channel.tenant_id,
        channel_id: channel.id,
        contact_id: contactId,
        provider_thread_id: convId,
        thread_status: "open",
        current_mode: "bot_active",
        entrypoint_type: "message_request",
        last_message_at: msgTime,
        last_message_preview: msgText?.substring(0, 200) || null,
      })
      .select("id")
      .single();

    if (threadErr || !newThread) {
      log.error(`[poller] failed to create thread for contact ${contactId}:`, threadErr?.message);
      return;
    }
    threadId = newThread.id;
  }

  // Save latest message if not already stored
  if (latestMsg?.id) {
    const { data: existingMsg } = await supabase
      .from("instagram_messages")
      .select("id")
      .eq("provider_message_id", latestMsg.id)
      .maybeSingle();

    if (!existingMsg) {
      await supabase.from("instagram_messages").insert({
        tenant_id: channel.tenant_id,
        thread_id: threadId,
        provider_message_id: latestMsg.id,
        direction: "inbound",
        message_type: "text",
        text_body: msgText,
        delivery_status: "delivered",
      }).then(({ error }) => {
        if (error) log.warn("[poller] message insert error:", error.message);
      });
    }
  }

  // Send dm_auto_reply if configured
  await sendAutoDmIfConfigured(supabase, channel, contactId, threadId, supabaseUrl, serviceKey, log);
}

async function sendAutoDmIfConfigured(
  supabase: ReturnType<typeof createClient>,
  channel: IgChannel,
  contactId: string,
  threadId: string,
  supabaseUrl: string,
  serviceKey: string,
  log: ReturnType<typeof createLogger>,
) {
  const { data: rules, error: rulesErr } = await supabase
    .from("instagram_media_watchlist")
    .select("id, reply_public_variants, first_comment_only, is_active")
    .eq("channel_id", channel.id)
    .eq("media_type", "dm_auto_reply")
    .eq("is_active", true)
    .limit(1);

  if (rulesErr) { log.error("[poller] rules query error:", rulesErr.message); return; }
  if (!rules?.length) return;

  const rule = rules[0];
  const replyText = rule.reply_public_variants?.[0];
  if (!replyText) return;

  // Dedup check (read-only — insert only after successful send)
  if (rule.first_comment_only) {
    const { data: existing, error: dedupErr } = await supabase
      .from("instagram_comment_replies_log")
      .select("id")
      .eq("comment_id", `dm_auto_reply:${contactId}`)
      .eq("reply_type", "dm_auto_reply")
      .maybeSingle();

    if (dedupErr) { log.error("[poller] dedup query error:", dedupErr.message); return; }
    if (existing) { log.info("[poller] dedup blocked for", contactId); return; }
  }

  const sendRes = await fetch(`${supabaseUrl}/functions/v1/instagram-send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      channel_id: channel.id,
      contact_id: contactId,
      thread_id: threadId,
      text: replyText,
      idempotency_key: `msg_req_dm_auto_reply_${contactId}_${rule.id}_${new Date().toISOString().substring(0, 10)}`,
    }),
  }).catch((e: unknown) => { log.error("[poller] fetch send-message error:", e); return null; });

  if (sendRes && !sendRes.ok) {
    const body = await sendRes.text().catch(() => "");
    log.error(`[poller] send-message ${sendRes.status}:`, body);
    return;
  }

  // Insert dedup only after successful send
  if (rule.first_comment_only && sendRes?.ok) {
    const { error: insertErr } = await supabase.from("instagram_comment_replies_log").insert({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      comment_id: `dm_auto_reply:${contactId}`,
      reply_type: "dm_auto_reply",
    });
    if (insertErr) log.error("[poller] dedup insert error:", insertErr.message);
    else log.info(`[poller] auto-reply sent and dedup registered for contact ${contactId}`);
  }
}
