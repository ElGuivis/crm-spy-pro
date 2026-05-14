import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptTokenAES as decryptToken } from "../_shared/ig-crypto.ts";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

async function fetchIgProfile(igsid: string, accessToken: string): Promise<{ name?: string; username?: string; profile_pic?: string } | null> {
  for (const host of ["graph.instagram.com", "graph.facebook.com"]) {
    try {
      const res = await fetch(
        `https://${host}/v21.0/${igsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(accessToken)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.name || data.username) return data;
      } else {
        await res.text();
      }
    } catch { /* try next */ }
  }
  return null;
}

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("instagram-webhook-worker", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || Deno.env.get("INSTAGRAM_APP_SECRET")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    requireInternalAuth(req);
    // Fetch unprocessed deliveries
    const { data: deliveries, error } = await supabase
      .from("instagram_webhook_deliveries")
      .select("id, channel_id, payload, parse_status, event_hash")
      .eq("processed", false)
      .eq("signature_valid", true)
      .in("parse_status", ["pending"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) throw error;
    if (!deliveries || deliveries.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log.info(`[ig-worker] Processing ${deliveries.length} deliveries`);
    let processed = 0;
    let errors = 0;

    for (const delivery of deliveries) {
      try {
        await supabase
          .from("instagram_webhook_deliveries")
          .update({ parse_status: "processing" })
          .eq("id", delivery.id);

        const payload = delivery.payload as Record<string, unknown>;
        const entries = payload?.entry || [];

        for (const entry of entries) {
          const igUserId = entry.id;

          // Find channel
          const { data: channel } = await supabase
            .from("instagram_channels")
            .select("id, tenant_id, ig_user_id, access_token_encrypted")
            .eq("ig_user_id", igUserId)
            .maybeSingle();

          if (!channel) {
            log.warn(`[ig-worker] No channel for ig_user_id: ${igUserId}`);
            continue;
          }

          // Process messaging events
          const messagingEvents = entry.messaging || [];
          for (const event of messagingEvents) {
            await processMessagingEvent(supabase, channel, event, encryptionKey);
          }

          // Process changes (comments, story mentions, etc)
          const changes = entry.changes || [];
          for (const change of changes) {
            if (change.field === "comments") {
              await processCommentEvent(supabase, channel, change.value, entry.time);
            } else if (change.field === "story_insights" || change.field === "mentions") {
              await processStoryMentionEvent(supabase, channel, change.value, entry.time);
          } else if (change.field === "follow") {
              await processFollowEvent(supabase, channel, change.value, entry.time);
            } else if (change.field === "messaging_referral" && change.value?.referral?.source === "SHARE") {
              // Share-to-DM: Meta sends shares as messaging_referral with source=SHARE
              await processShareToDmEvent(supabase, channel, change.value, entry.time);
            } else {
              await logEvent(supabase, channel, {
                event_type: `change:${change.field}`,
                event_source: "webhook",
                event_time: new Date(entry.time * 1000).toISOString(),
                normalized_payload: change.value,
              });
            }
          }
        }

        await supabase
          .from("instagram_webhook_deliveries")
          .update({ processed: true, processed_at: new Date().toISOString(), parse_status: "done" })
          .eq("id", delivery.id);

        processed++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error(`[ig-worker] Error processing delivery ${delivery.id}:`, errMsg);
        await supabase
          .from("instagram_webhook_deliveries")
          .update({ parse_status: "error", error_message: errMsg })
          .eq("id", delivery.id);
        errors++;
      }
    }

    log.info(`[ig-worker] Done: ${processed} processed, ${errors} errors`);
    return new Response(JSON.stringify({ processed, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("[ig-worker] Fatal error:", error);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface IgChannel { id: string; tenant_id: string; ig_user_id: string; access_token_encrypted: string }
interface IgMessagingEvent { sender?: { id: string }; recipient?: { id: string }; timestamp?: number; referral?: Record<string, string>; postback?: { payload?: string; title?: string }; message?: { mid?: string; text?: string; attachments?: { type: string; payload?: { url?: string } }[]; quick_reply?: Record<string, unknown>; reply_to?: { story?: unknown } }; delivery?: { mids?: string[] }; read?: unknown }

async function processMessagingEvent(supabase: ReturnType<typeof createClient>, channel: IgChannel, event: IgMessagingEvent, encryptionKey: string) {
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  const timestamp = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();

  // Determine direction: if sender is the business account, it's outgoing
  const isIncoming = senderId !== channel.ig_user_id && senderId !== undefined;
  const contactIgsid = isIncoming ? senderId : recipientId;

  if (!contactIgsid) return;

  // Determine entrypoint from referral
  let entrypointType = "dm";
  let entrypointRef: string | null = null;
  if (event.referral) {
    const ref = event.referral;
    if (ref.source === "ADS") {
      entrypointType = "ad_welcome";
      entrypointRef = JSON.stringify({ campaign_id: ref.ad_id, ref: ref.ref });
    } else if (ref.ref) {
      entrypointType = "ref_url";
      entrypointRef = ref.ref;
    } else if (ref.source === "IGDM_ICE_BREAKER") {
      entrypointType = "ice_breaker";
      entrypointRef = ref.title || null;
    } else if (ref.source === "PERSISTENT_MENU") {
      entrypointType = "persistent_menu";
      entrypointRef = ref.title || null;
    }
  }
  if (event.postback) {
    const pb = event.postback;
    if (pb.payload?.startsWith("ICE_BREAKER_")) {
      entrypointType = "ice_breaker";
      entrypointRef = pb.payload;
    } else if (pb.payload?.startsWith("MENU_")) {
      entrypointType = "persistent_menu";
      entrypointRef = pb.payload;
    }
  }

  if (!contactIgsid) return;

  // Upsert contact
  const { data: contact } = await supabase
    .from("instagram_contacts")
    .select("id, display_name")
    .eq("channel_id", channel.id)
    .eq("igsid", contactIgsid)
    .maybeSingle();

  let contactId: string;
  if (contact) {
    contactId = contact.id;
    // Update last_seen
    const updates: Record<string, string | null> = { last_seen_at: timestamp, updated_at: new Date().toISOString() };
    if (isIncoming) {
      updates.last_user_interaction_at = timestamp;
      // Standard 24h window
      updates.standard_window_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    // Backfill profile if missing
    if (!contact.display_name) {
      try {
        const { accessToken: resolvedToken } = await resolveInstagramAccessToken(channel.access_token_encrypted);
        const profile = await fetchIgProfile(contactIgsid, resolvedToken);
        if (profile) {
          updates.display_name = profile.name || profile.username;
          updates.instagram_username = profile.username || null;
          updates.profile_pic_url = profile.profile_pic || null;
          log.info(`[ig-worker] Backfilled profile for ${contactIgsid}: ${updates.display_name}`);
        }
      } catch (e: unknown) {
        log.warn(`[ig-worker] Backfill error for ${contactIgsid}:`, e instanceof Error ? e.message : e);
      }
    }
    await supabase.from("instagram_contacts").update(updates).eq("id", contactId);
  } else {
    // Fetch Instagram profile info for new contacts
    let displayName: string | null = null;
    let instagramUsername: string | null = null;
    let profilePicUrl: string | null = null;
    try {
      const { accessToken: resolvedToken } = await resolveInstagramAccessToken(channel.access_token_encrypted);
      const profile = await fetchIgProfile(contactIgsid, resolvedToken);
      if (profile) {
        displayName = profile.name || profile.username || null;
        instagramUsername = profile.username || null;
        profilePicUrl = profile.profile_pic || null;
        log.info(`[ig-worker] Fetched profile for ${contactIgsid}: ${displayName} (@${instagramUsername})`);
      }
    } catch (e: unknown) {
      log.warn(`[ig-worker] Profile fetch error for ${contactIgsid}:`, e instanceof Error ? e.message : e);
    }

    const { data: newContact } = await supabase
      .from("instagram_contacts")
      .insert({
        tenant_id: channel.tenant_id,
        channel_id: channel.id,
        igsid: contactIgsid,
        display_name: displayName,
        instagram_username: instagramUsername,
        profile_pic_url: profilePicUrl,
        first_seen_at: timestamp,
        last_seen_at: timestamp,
        last_user_interaction_at: isIncoming ? timestamp : null,
        standard_window_expires_at: isIncoming ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
        source_first_entry: entrypointType,
      })
      .select("id")
      .single();
    contactId = newContact!.id;
  }

  // Upsert thread
  const { data: thread } = await supabase
    .from("instagram_threads")
    .select("id, thread_status")
    .eq("channel_id", channel.id)
    .eq("contact_id", contactId)
    .maybeSingle();

  let threadId: string;
  if (thread) {
    threadId = thread.id;
    const threadUpdate: Record<string, string> = {
      last_message_at: timestamp,
      updated_at: new Date().toISOString(),
    };
    if (isIncoming && ["closed", "pending"].includes(thread.thread_status)) {
      threadUpdate.thread_status = "open";
    }
    if (event.message?.text) {
      threadUpdate.last_message_preview = event.message.text.substring(0, 200);
    }
    await supabase.from("instagram_threads").update(threadUpdate).eq("id", threadId);
  } else {
    const { data: newThread } = await supabase
      .from("instagram_threads")
      .insert({
        tenant_id: channel.tenant_id,
        channel_id: channel.id,
        contact_id: contactId,
        thread_status: "open",
        current_mode: "bot_active",
        entrypoint_type: entrypointType,
        entrypoint_ref: entrypointRef,
        last_message_at: timestamp,
        last_message_preview: event.message?.text?.substring(0, 200) || null,
      })
      .select("id")
      .single();
    threadId = newThread!.id;

    // Track deep link conversion via RPC (atomic increment)
    if (entrypointType === "ref_url" && entrypointRef) {
      // Try RPC first, then fallback to read-increment-write
      const rpcResult = await supabase.rpc("increment_deep_link_conversations", { p_ref_key: entrypointRef }).catch(() => null);
      if (!rpcResult?.data) {
        // Fallback: read current value, then update
        const { data: linkRow } = await supabase
          .from("instagram_deep_links")
          .select("id, conversation_count")
          .eq("ref_key", entrypointRef)
          .eq("channel_id", channel.id)
          .maybeSingle();
        if (linkRow) {
          await supabase
            .from("instagram_deep_links")
            .update({ conversation_count: (linkRow.conversation_count || 0) + 1 })
            .eq("id", linkRow.id)
            .catch(() => {});
        }
      }
    }
  }

  // Dispatch trigger for referrals/postbacks
  if (isIncoming && (event.referral || event.postback)) {
    let triggerEventType = entrypointType;
    if (entrypointType === "ice_breaker") triggerEventType = "ice_breaker_click";
    if (entrypointType === "persistent_menu") triggerEventType = "persistent_menu_click";
    if (entrypointType === "ref_url") triggerEventType = "ref_url_entry";

    await supabase.functions.invoke("instagram-trigger-dispatcher", {
      body: {
        event_type: triggerEventType,
        channel_id: channel.id,
        thread_id: threadId,
        contact_id: contactId,
        tenant_id: channel.tenant_id,
        message_text: event.message?.text || event.postback?.payload || "",
        message_id: event.message?.mid || `ref:${Date.now()}`,
      },
    }).catch((e: unknown) => log.warn("[ig-worker] Trigger dispatch error:", e));
  }

  // Per-ad specific welcome flow — matches ad_id against instagram_ad_welcome_flows.
  // The generic trigger_rules dispatch above handles channel-wide ad_welcome flows;
  // this block handles per-ad flow overrides configured via the Welcome Ads UI.
  if (isIncoming && entrypointType === "ad_welcome" && entrypointRef) {
    try {
      const refData = JSON.parse(entrypointRef) as { campaign_id?: string };
      const adId = refData.campaign_id;
      if (adId) {
        const { data: adWelcome } = await supabase
          .from("instagram_ad_welcome_flows")
          .select("flow_id")
          .eq("channel_id", channel.id)
          .eq("ad_id", adId)
          .eq("is_active", true)
          .maybeSingle();

        if (adWelcome?.flow_id) {
          const { data: flow } = await supabase
            .from("instagram_flows")
            .select("live_version_id")
            .eq("id", adWelcome.flow_id)
            .eq("status", "active")
            .maybeSingle();

          if (flow?.live_version_id) {
            const idempKey = `ad_welcome_specific:${adId}:${contactId}`;
            const { data: run, error: runErr } = await supabase
              .from("instagram_flow_runs")
              .insert({
                tenant_id: channel.tenant_id,
                flow_id: adWelcome.flow_id,
                version_id: flow.live_version_id,
                thread_id: threadId,
                contact_id: contactId,
                status: "running",
                idempotency_key: idempKey,
                context: { event_type: "ad_welcome", channel_id: channel.id, ad_id: adId },
              })
              .select("id")
              .single();

            if (!runErr && run) {
              await supabase.functions.invoke("instagram-flow-runner", {
                body: { run_id: run.id },
              }).catch((e: unknown) => log.warn("[ig-worker] Ad welcome specific flow runner error:", e));
            } else if (runErr && runErr.code !== "23505") {
              log.warn("[ig-worker] Ad welcome flow run insert error:", runErr);
            }
          }
        }
      }
    } catch (e) {
      log.warn("[ig-worker] Ad welcome specific flow dispatch error:", e);
    }
  }

  // Dispatch trigger for story replies (message.reply_to.story)
  if (isIncoming && event.message?.reply_to?.story) {
    await supabase.functions.invoke("instagram-trigger-dispatcher", {
      body: {
        event_type: "story_reply",
        channel_id: channel.id,
        thread_id: threadId,
        contact_id: contactId,
        tenant_id: channel.tenant_id,
        message_text: event.message?.text || "",
        message_id: event.message?.mid || `story_reply:${Date.now()}`,
      },
    }).catch((e: unknown) => log.warn("[ig-worker] Story reply trigger error:", e));

    // Also check watchlist for simple story_reply auto-DM
    await handleWatchlistAutoDm(supabase, channel, "story_reply", contactIgsid, threadId, contactId).catch((e: unknown) => log.warn("[ig-worker] Story reply watchlist error:", e));
  }

  // Dispatch trigger for regular incoming messages (dm_any_message / dm_keyword)
  if (isIncoming && event.message && !event.referral && !event.postback && !event.message?.reply_to?.story) {
    await supabase.functions.invoke("instagram-trigger-dispatcher", {
      body: {
        event_type: "message_received",
        channel_id: channel.id,
        thread_id: threadId,
        contact_id: contactId,
        tenant_id: channel.tenant_id,
        message_text: event.message?.text || "",
        message_id: event.message?.mid || `msg:${Date.now()}`,
      },
    }).catch((e: unknown) => log.warn("[ig-worker] Message trigger error:", e));

    // Check watchlist for dm_auto_reply (first message auto-reply)
    await handleWatchlistAutoDm(supabase, channel, "dm_auto_reply", contactIgsid, threadId, contactId).catch((e: unknown) => log.warn("[ig-worker] DM auto-reply watchlist error:", e));
  }


  if (event.message) {
    const msg = event.message;
    const providerMsgId = msg.mid;

    // Dedup by provider_message_id
    const { data: existingMsg } = await supabase
      .from("instagram_messages")
      .select("id")
      .eq("provider_message_id", providerMsgId)
      .maybeSingle();

    if (!existingMsg) {
      let messageType = "text";
      let textBody = msg.text || null;
      let mediaUrl: string | null = null;
      let msgPayload: Record<string, unknown> | null = null;

      if (msg.attachments && msg.attachments.length > 0) {
        const att = msg.attachments[0];
        messageType = att.type || "attachment";
        mediaUrl = att.payload?.url || null;
        msgPayload = { attachments: msg.attachments };
      }

      if (msg.quick_reply) {
        msgPayload = { ...(msgPayload || {}), quick_reply: msg.quick_reply };
      }

      await supabase.from("instagram_messages").insert({
        tenant_id: channel.tenant_id,
        thread_id: threadId,
        provider_message_id: providerMsgId,
        direction: isIncoming ? "inbound" : "outbound",
        message_type: messageType,
        text_body: textBody,
        media_url: mediaUrl,
        payload: msgPayload,
        delivery_status: isIncoming ? "delivered" : "sent",
      });
    }
  }

  // Process message delivery/read status updates
  if (event.delivery) {
    const mids = event.delivery.mids || [];
    for (const mid of mids) {
      await supabase
        .from("instagram_messages")
        .update({ delivery_status: "delivered" })
        .eq("provider_message_id", mid);
    }
  }

  if (event.read) {
    // Mark all messages before watermark as read
    await supabase
      .from("instagram_messages")
      .update({ delivery_status: "read" })
      .eq("thread_id", threadId)
      .eq("direction", "outbound")
      .in("delivery_status", ["sent", "delivered"]);
  }

  // Log event
  let eventType = "unknown";
  if (event.message) eventType = "message";
  else if (event.delivery) eventType = "delivery";
  else if (event.read) eventType = "read";
  else if (event.postback) eventType = "postback";
  else if (event.referral) eventType = "referral";

  await logEvent(supabase, channel, {
    contact_id: contactId,
    thread_id: threadId,
    event_type: eventType,
    event_source: "messaging",
    event_time: timestamp,
    normalized_payload: event,
  });
}

async function logEvent(supabase: ReturnType<typeof createClient>, channel: { id: string; tenant_id: string }, data: Record<string, unknown>) {
  await supabase.from("instagram_event_log").insert({
    tenant_id: channel.tenant_id,
    channel_id: channel.id,
    ...data,
  });
}

async function processCommentEvent(supabase: ReturnType<typeof createClient>, channel: { id: string; tenant_id: string }, value: Record<string, unknown>, entryTime: number) {
  const commentId = value.id;
  const mediaId = value.media?.id;
  const commentText = value.text || "";
  const fromId = value.from?.id;
  const timestamp = new Date(entryTime * 1000).toISOString();

  if (!commentId || !fromId) return;

  // Determine media type (post vs reel)
  const isReel = value.media?.media_product_type === "REELS";
  const eventType = isReel ? "reel_comment" : "post_comment";

  // Log
  await logEvent(supabase, channel, {
    event_type: eventType,
    event_source: "comment",
    event_time: timestamp,
    normalized_payload: value,
  });

  // Check watchlist rules
  const { data: rules } = await supabase
    .from("instagram_media_watchlist")
    .select("id, channel_id, watch_mode, media_id, media_type, keywords_include, keywords_exclude, first_comment_only, delay_seconds, reply_public_enabled, reply_public_variants, round_robin_index, private_reply_enabled, private_reply_flow_id, dm_message, keyword_responses, is_active")
    .eq("channel_id", channel.id)
    .eq("is_active", true)
    .in("media_type", [isReel ? "reel" : "post"]);

  if (!rules || rules.length === 0) return;

  for (const rule of rules) {
    // Check watch_mode
    if (rule.watch_mode === "specific" && rule.media_id !== mediaId) continue;

    // Check keywords
    const text = commentText.toLowerCase();
    if (rule.keywords_include?.length > 0) {
      const hasInclude = rule.keywords_include.some((kw: string) => text.includes(kw.toLowerCase()));
      if (!hasInclude) continue;
    }
    if (rule.keywords_exclude?.length > 0) {
      const hasExclude = rule.keywords_exclude.some((kw: string) => text.includes(kw.toLowerCase()));
      if (hasExclude) continue;
    }

    // First comment only check
    if (rule.first_comment_only) {
      const { data: existing } = await supabase
        .from("instagram_comment_replies_log")
        .select("id")
        .eq("comment_id", `${fromId}:${mediaId}:first`)
        .maybeSingle();
      if (existing) continue;
      // Mark as processed
      await supabase.from("instagram_comment_replies_log").insert({
        tenant_id: channel.tenant_id,
        channel_id: channel.id,
        comment_id: `${fromId}:${mediaId}:first`,
        reply_type: "first_check",
      }).catch(() => {});
    }

    // Delay
    if (rule.delay_seconds > 0) {
      await new Promise(r => setTimeout(r, rule.delay_seconds * 1000));
    }

    // Public reply
    if (rule.reply_public_enabled && rule.reply_public_variants?.length > 0) {
      const idx = rule.round_robin_index % rule.reply_public_variants.length;
      const replyText = rule.reply_public_variants[idx];
      await supabase.functions.invoke("instagram-send-comment-reply", {
        body: { channel_id: channel.id, comment_id: commentId, text: replyText },
      }).catch((e: unknown) => log.error("[ig-worker] Comment reply error:", e));

      // Update round robin index
      await supabase.from("instagram_media_watchlist")
        .update({ round_robin_index: idx + 1 })
        .eq("id", rule.id);
    }

    // Private reply
    if (rule.private_reply_enabled) {
      if (rule.private_reply_flow_id) {
        // Trigger flow for this contact
        await supabase.functions.invoke("instagram-trigger-dispatcher", {
          body: {
            event_type: eventType,
            channel_id: channel.id,
            thread_id: "pending",
            contact_id: fromId,
            tenant_id: channel.tenant_id,
            message_text: commentText,
            message_id: commentId,
          },
        }).catch((e: unknown) => log.error("[ig-worker] Trigger dispatch error:", e));
      } else {
        // Resolve DM text: multi-mode matches per keyword, single-mode uses dm_message
        let dmText: string | null = null;
        const kr = rule.keyword_responses as Array<{ keyword: string; dm_message: string }> | null;
        if (kr && kr.length > 0) {
          const lowerText = (commentText as string).toLowerCase();
          const matched = kr.find((r) => lowerText.includes(r.keyword.toLowerCase()));
          dmText = matched?.dm_message ?? null;
        } else {
          dmText = rule.dm_message ?? null;
        }
        if (dmText) {
          await supabase.functions.invoke("instagram-send-private-reply", {
            body: {
              channel_id: channel.id,
              comment_id: commentId,
              text: dmText,
              idempotency_key: `comment_dm:${commentId}:${rule.id}`,
            },
          }).catch((e: unknown) => log.error("[ig-worker] Private reply error:", e));
        }
      }
    }
  }
}

async function processStoryMentionEvent(supabase: ReturnType<typeof createClient>, channel: { id: string; tenant_id: string }, value: Record<string, unknown>, entryTime: number) {
  const timestamp = new Date(entryTime * 1000).toISOString();
  const mentionerId = value.sender_id || value.from?.id;

  await logEvent(supabase, channel, {
    event_type: "story_mention",
    event_source: "story",
    event_time: timestamp,
    normalized_payload: value,
  });

  // Check watchlist rules for story mentions
  const { data: rules } = await supabase
    .from("instagram_media_watchlist")
    .select("id, private_reply_flow_id, reply_public_variants, is_active")
    .eq("channel_id", channel.id)
    .eq("is_active", true)
    .eq("media_type", "story_mention");

  if (!rules || rules.length === 0 || !mentionerId) return;

  for (const rule of rules) {
    // Throttle: once per 24h per user
    const { data: recent } = await supabase
      .from("instagram_comment_replies_log")
      .select("id")
      .eq("comment_id", `mention:${mentionerId}`)
      .eq("reply_type", "story_mention")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();
    if (recent) continue;

    await supabase.from("instagram_comment_replies_log").insert({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      comment_id: `mention:${mentionerId}`,
      reply_type: "story_mention",
    }).catch(() => {});

    if (rule.private_reply_flow_id) {
      await supabase.functions.invoke("instagram-trigger-dispatcher", {
        body: {
          event_type: "story_mention",
          channel_id: channel.id,
          thread_id: "pending",
          contact_id: mentionerId,
          tenant_id: channel.tenant_id,
          message_text: "",
          message_id: `mention:${Date.now()}`,
        },
      }).catch((e: unknown) => log.error("[ig-worker] Story mention trigger error:", e));
    } else if (rule.reply_public_variants?.length > 0) {
      // Simple text-based DM (no flow needed) — send via direct Meta API
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const replyText = rule.reply_public_variants[0];

      // Need to find/create contact and thread for this mentioner
      const { data: contact } = await supabase
        .from("instagram_contacts")
        .select("id")
        .eq("channel_id", channel.id)
        .eq("igsid", mentionerId)
        .maybeSingle();

      let contactId = contact?.id;
      if (!contactId) {
        const { data: newContact } = await supabase
          .from("instagram_contacts")
          .insert({
            tenant_id: channel.tenant_id,
            channel_id: channel.id,
            igsid: mentionerId,
            source_first_entry: "story_mention",
          })
          .select("id")
          .single();
        contactId = newContact?.id;
      }

      if (contactId) {
        const { data: thread } = await supabase
          .from("instagram_threads")
          .select("id")
          .eq("channel_id", channel.id)
          .eq("contact_id", contactId)
          .maybeSingle();

        let threadId = thread?.id;
        if (!threadId) {
          const { data: newThread } = await supabase
            .from("instagram_threads")
            .insert({
              tenant_id: channel.tenant_id,
              channel_id: channel.id,
              contact_id: contactId,
              thread_status: "active",
              current_mode: "bot",
            })
            .select("id")
            .single();
          threadId = newThread?.id;
        }

        if (threadId) {
          await fetch(`${supabaseUrl}/functions/v1/instagram-send-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              channel_id: channel.id,
              thread_id: threadId,
              text: replyText,
              idempotency_key: `watchlist_story_mention_${contactId}_${rule.id}`,
            }),
          }).catch(() => {});
        }
      }
    }
  }
}

async function processFollowEvent(supabase: ReturnType<typeof createClient>, channel: { id: string; tenant_id: string; ig_user_id: string }, value: Record<string, unknown>, entryTime: number) {
  const timestamp = new Date(entryTime * 1000).toISOString();
  const followerId = value.from?.id || value.sender_id;

  await logEvent(supabase, channel, {
    event_type: "follow",
    event_source: "follow",
    event_time: timestamp,
    normalized_payload: value,
  });

  if (!followerId) return;

  // Upsert contact
  const { data: existingContact } = await supabase
    .from("instagram_contacts")
    .select("id")
    .eq("channel_id", channel.id)
    .eq("igsid", followerId)
    .maybeSingle();

  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    await supabase.from("instagram_contacts")
      .update({ last_seen_at: timestamp, updated_at: new Date().toISOString() })
      .eq("id", contactId);
  } else {
    const { data: newContact } = await supabase
      .from("instagram_contacts")
      .insert({
        tenant_id: channel.tenant_id,
        channel_id: channel.id,
        igsid: followerId,
        first_seen_at: timestamp,
        last_seen_at: timestamp,
        source_first_entry: "follow",
      })
      .select("id")
      .single();
    contactId = newContact!.id;
  }

  // Invoke the experimental trigger (it handles capability + feature flag checks internally)
  await supabase.functions.invoke("instagram-experimental-trigger", {
    body: {
      channel_id: channel.id,
      contact_id: contactId,
      tenant_id: channel.tenant_id,
      event_type: "follow_to_dm",
    },
  }).catch((e: unknown) => log.warn("[ig-worker] Follow-to-DM trigger error:", e));
}

async function processShareToDmEvent(supabase: ReturnType<typeof createClient>, channel: { id: string; tenant_id: string; ig_user_id: string }, value: Record<string, unknown>, entryTime: number) {
  const timestamp = new Date(entryTime * 1000).toISOString();
  const senderId = value.sender?.id || value.from?.id;

  await logEvent(supabase, channel, {
    event_type: "share_to_dm",
    event_source: "share",
    event_time: timestamp,
    normalized_payload: value,
  });

  if (!senderId) return;

  // Upsert contact
  const { data: existingContact } = await supabase
    .from("instagram_contacts")
    .select("id")
    .eq("channel_id", channel.id)
    .eq("igsid", senderId)
    .maybeSingle();

  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    await supabase.from("instagram_contacts")
      .update({ last_seen_at: timestamp, updated_at: new Date().toISOString() })
      .eq("id", contactId);
  } else {
    const { data: newContact } = await supabase
      .from("instagram_contacts")
      .insert({
        tenant_id: channel.tenant_id,
        channel_id: channel.id,
        igsid: senderId,
        first_seen_at: timestamp,
        last_seen_at: timestamp,
        source_first_entry: "share",
      })
      .select("id")
      .single();
    contactId = newContact!.id;
  }

  // Invoke the experimental trigger (it handles capability + feature flag checks internally)
  await supabase.functions.invoke("instagram-experimental-trigger", {
    body: {
      channel_id: channel.id,
      contact_id: contactId,
      tenant_id: channel.tenant_id,
      event_type: "share_to_dm",
    },
  }).catch((e: unknown) => log.warn("[ig-worker] Share-to-DM trigger error:", e));
}

/**
 * Handle simple watchlist-based auto-DM for story_reply, story_mention, dm_auto_reply.
 * These are configured via instagram_media_watchlist and send a direct DM without requiring a flow.
 */
async function handleWatchlistAutoDm(
  supabase: ReturnType<typeof createClient>,
  channel: IgChannel,
  mediaType: string,
  contactIgsid: string,
  threadId: string,
  contactId: string,
) {
  const { data: rules } = await supabase
    .from("instagram_media_watchlist")
    .select("id, reply_public_variants, delay_seconds, first_comment_only, is_active")
    .eq("channel_id", channel.id)
    .eq("media_type", mediaType)
    .eq("is_active", true)
    .limit(1);

  if (!rules || rules.length === 0) return;
  const rule = rules[0];

  const replyText = rule.reply_public_variants?.[0];
  if (!replyText) return;

  // Dedup: once per user per automation
  if (rule.first_comment_only) {
    const { data: existing } = await supabase
      .from("instagram_comment_replies_log")
      .select("id")
      .eq("comment_id", `${mediaType}:${contactId}`)
      .eq("reply_type", mediaType)
      .maybeSingle();
    if (existing) return;

    await supabase.from("instagram_comment_replies_log").insert({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      comment_id: `${mediaType}:${contactId}`,
      reply_type: mediaType,
    }).catch(() => {});
  }

  // Delay
  if (rule.delay_seconds && rule.delay_seconds > 0) {
    await new Promise(r => setTimeout(r, rule.delay_seconds * 1000));
  }

  // Send DM via instagram-send-message (contact already has open messaging window)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  await fetch(`${supabaseUrl}/functions/v1/instagram-send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      channel_id: channel.id,
      thread_id: threadId,
      text: replyText,
      idempotency_key: `watchlist_${mediaType}_${contactId}_${rule.id}`,
    }),
  }).catch((e: unknown) => {
    // Fallback logging only
  });
}
