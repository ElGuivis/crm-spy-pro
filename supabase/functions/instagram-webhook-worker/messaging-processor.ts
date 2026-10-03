import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";
import { createLogger } from "../_shared/correlation.ts";

type Supabase = ReturnType<typeof createClient>;
type Log = ReturnType<typeof createLogger>;

export interface IgChannel { id: string; tenant_id: string; ig_user_id: string; access_token_encrypted: string }
interface IgMessagingEvent {
  sender?: { id: string }; recipient?: { id: string }; timestamp?: number;
  referral?: Record<string, string>; postback?: { payload?: string; title?: string };
  message?: { mid?: string; text?: string; attachments?: { type: string; payload?: { url?: string } }[]; quick_reply?: Record<string, unknown>; reply_to?: { story?: unknown } };
  delivery?: { mids?: string[] }; read?: unknown;
}

async function fetchIgProfile(igsid: string, accessToken: string): Promise<{ name?: string; username?: string; profile_pic?: string } | null> {
  for (const host of ["graph.instagram.com", "graph.facebook.com"]) {
    try {
      const res = await fetch(`https://${host}/v21.0/${igsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(accessToken)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.name || data.username) return data;
      } else { await res.text(); }
    } catch { /* try next */ }
  }
  return null;
}

export async function logEvent(supabase: Supabase, channel: { id: string; tenant_id: string }, data: Record<string, unknown>) {
  await supabase.from("instagram_event_log").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, ...data });
}

export async function processMessagingEvent(supabase: Supabase, channel: IgChannel, event: IgMessagingEvent, _encryptionKey: string, log: Log) {
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  const timestamp = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
  const isIncoming = senderId !== channel.ig_user_id && senderId !== undefined;
  const contactIgsid = isIncoming ? senderId : recipientId;
  if (!contactIgsid) return;

  let entrypointType = "dm";
  let entrypointRef: string | null = null;
  if (event.referral) {
    const ref = event.referral;
    if (ref.source === "ADS") { entrypointType = "ad_welcome"; entrypointRef = JSON.stringify({ campaign_id: ref.ad_id, ref: ref.ref }); }
    else if (ref.ref) { entrypointType = "ref_url"; entrypointRef = ref.ref; }
    else if (ref.source === "IGDM_ICE_BREAKER") { entrypointType = "ice_breaker"; entrypointRef = ref.title || null; }
    else if (ref.source === "PERSISTENT_MENU") { entrypointType = "persistent_menu"; entrypointRef = ref.title || null; }
  }
  if (event.postback) {
    const pb = event.postback;
    if (pb.payload?.startsWith("ICE_BREAKER_")) { entrypointType = "ice_breaker"; entrypointRef = pb.payload; }
    else if (pb.payload?.startsWith("MENU_")) { entrypointType = "persistent_menu"; entrypointRef = pb.payload; }
  }

  const { data: contact } = await supabase.from("instagram_contacts").select("id, display_name").eq("channel_id", channel.id).eq("igsid", contactIgsid).maybeSingle();

  let contactId: string;
  if (contact) {
    contactId = contact.id;
    const updates: Record<string, string | null> = { last_seen_at: timestamp, updated_at: new Date().toISOString() };
    if (isIncoming) { updates.last_user_interaction_at = timestamp; updates.standard_window_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); }
    if (!contact.display_name) {
      try {
        const { accessToken: resolvedToken } = await resolveInstagramAccessToken(channel.access_token_encrypted);
        const profile = await fetchIgProfile(contactIgsid, resolvedToken);
        if (profile) { updates.display_name = profile.name || profile.username || null; updates.instagram_username = profile.username || null; updates.profile_pic_url = profile.profile_pic || null; log.info(`[ig-worker] Backfilled profile for ${contactIgsid}: ${updates.display_name}`); }
      } catch (e: unknown) { log.warn(`[ig-worker] Backfill error for ${contactIgsid}:`, e instanceof Error ? e.message : e); }
    }
    await supabase.from("instagram_contacts").update(updates).eq("id", contactId);
  } else {
    let displayName: string | null = null, instagramUsername: string | null = null, profilePicUrl: string | null = null;
    try {
      const { accessToken: resolvedToken } = await resolveInstagramAccessToken(channel.access_token_encrypted);
      const profile = await fetchIgProfile(contactIgsid, resolvedToken);
      if (profile) { displayName = profile.name || profile.username || null; instagramUsername = profile.username || null; profilePicUrl = profile.profile_pic || null; log.info(`[ig-worker] Fetched profile for ${contactIgsid}: ${displayName} (@${instagramUsername})`); }
    } catch (e: unknown) { log.warn(`[ig-worker] Profile fetch error for ${contactIgsid}:`, e instanceof Error ? e.message : e); }
    const { data: newContact } = await supabase.from("instagram_contacts").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, igsid: contactIgsid, display_name: displayName, instagram_username: instagramUsername, profile_pic_url: profilePicUrl, first_seen_at: timestamp, last_seen_at: timestamp, last_user_interaction_at: isIncoming ? timestamp : null, standard_window_expires_at: isIncoming ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null, source_first_entry: entrypointType }).select("id").single();
    contactId = newContact!.id;
  }

  const { data: thread } = await supabase.from("instagram_threads").select("id, thread_status").eq("channel_id", channel.id).eq("contact_id", contactId).maybeSingle();
  let threadId: string;
  if (thread) {
    threadId = thread.id;
    const threadUpdate: Record<string, string> = { last_message_at: timestamp, updated_at: new Date().toISOString() };
    if (isIncoming && ["closed", "pending"].includes(thread.thread_status)) threadUpdate.thread_status = "open";
    if (event.message?.text) threadUpdate.last_message_preview = event.message.text.substring(0, 200);
    await supabase.from("instagram_threads").update(threadUpdate).eq("id", threadId);
  } else {
    const { data: newThread } = await supabase.from("instagram_threads").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, contact_id: contactId, thread_status: "open", current_mode: "bot_active", entrypoint_type: entrypointType, entrypoint_ref: entrypointRef, last_message_at: timestamp, last_message_preview: event.message?.text?.substring(0, 200) || null }).select("id").single();
    threadId = newThread!.id;
    if (entrypointType === "ref_url" && entrypointRef) {
      const rpcResult = await supabase.rpc("increment_deep_link_conversations", { p_ref_key: entrypointRef }).catch(() => null);
      if (!rpcResult?.data) {
        const { data: linkRow } = await supabase.from("instagram_deep_links").select("id, conversation_count").eq("ref_key", entrypointRef).eq("channel_id", channel.id).maybeSingle();
        if (linkRow) await supabase.from("instagram_deep_links").update({ conversation_count: (linkRow.conversation_count || 0) + 1 }).eq("id", linkRow.id).catch(() => {});
      }
    }
  }

  if (isIncoming && (event.referral || event.postback)) {
    let triggerEventType = entrypointType;
    if (entrypointType === "ice_breaker") triggerEventType = "ice_breaker_click";
    if (entrypointType === "persistent_menu") triggerEventType = "persistent_menu_click";
    if (entrypointType === "ref_url") triggerEventType = "ref_url_entry";
    await supabase.functions.invoke("instagram-trigger-dispatcher", { body: { event_type: triggerEventType, channel_id: channel.id, thread_id: threadId, contact_id: contactId, tenant_id: channel.tenant_id, message_text: event.message?.text || event.postback?.payload || "", message_id: event.message?.mid || `ref:${Date.now()}` } }).catch((e: unknown) => log.warn("[ig-worker] Trigger dispatch error:", e));
  }

  if (isIncoming && entrypointType === "ad_welcome" && entrypointRef) {
    try {
      const refData = JSON.parse(entrypointRef) as { campaign_id?: string };
      const adId = refData.campaign_id;
      if (adId) {
        const { data: adWelcome } = await supabase.from("instagram_ad_welcome_flows").select("flow_id").eq("channel_id", channel.id).eq("ad_id", adId).eq("is_active", true).maybeSingle();
        if (adWelcome?.flow_id) {
          const { data: flow } = await supabase.from("instagram_flows").select("live_version_id").eq("id", adWelcome.flow_id).eq("status", "active").maybeSingle();
          if (flow?.live_version_id) {
            const idempKey = `ad_welcome_specific:${adId}:${contactId}`;
            const { data: run, error: runErr } = await supabase.from("instagram_flow_runs").insert({ tenant_id: channel.tenant_id, flow_id: adWelcome.flow_id, version_id: flow.live_version_id, thread_id: threadId, contact_id: contactId, status: "running", idempotency_key: idempKey, context: { event_type: "ad_welcome", channel_id: channel.id, ad_id: adId } }).select("id").single();
            if (!runErr && run) { await supabase.functions.invoke("instagram-flow-runner", { body: { run_id: run.id } }).catch((e: unknown) => log.warn("[ig-worker] Ad welcome specific flow runner error:", e)); }
            else if (runErr && runErr.code !== "23505") { log.warn("[ig-worker] Ad welcome flow run insert error:", runErr); }
          }
        }
      }
    } catch (e) { log.warn("[ig-worker] Ad welcome specific flow dispatch error:", e); }
  }

  if (isIncoming && event.message?.reply_to?.story) {
    await supabase.functions.invoke("instagram-trigger-dispatcher", { body: { event_type: "story_reply", channel_id: channel.id, thread_id: threadId, contact_id: contactId, tenant_id: channel.tenant_id, message_text: event.message?.text || "", message_id: event.message?.mid || `story_reply:${Date.now()}` } }).catch((e: unknown) => log.warn("[ig-worker] Story reply trigger error:", e));
    await handleWatchlistAutoDm(supabase, channel, "story_reply", contactIgsid, threadId, contactId).catch((e: unknown) => log.warn("[ig-worker] Story reply watchlist error:", e));
  }

  if (isIncoming && event.message && !event.referral && !event.postback && !event.message?.reply_to?.story) {
    await supabase.functions.invoke("instagram-trigger-dispatcher", { body: { event_type: "message_received", channel_id: channel.id, thread_id: threadId, contact_id: contactId, tenant_id: channel.tenant_id, message_text: event.message?.text || "", message_id: event.message?.mid || `msg:${Date.now()}` } }).catch((e: unknown) => log.warn("[ig-worker] Message trigger error:", e));
    await handleWatchlistAutoDm(supabase, channel, "dm_auto_reply", contactIgsid, threadId, contactId).catch((e: unknown) => log.warn("[ig-worker] DM auto-reply watchlist error:", e));
  }

  if (event.message) {
    const msg = event.message;
    const providerMsgId = msg.mid;
    const { data: existingMsg } = await supabase.from("instagram_messages").select("id").eq("provider_message_id", providerMsgId).maybeSingle();
    if (!existingMsg) {
      const textBody = msg.text || null;
      let messageType = "text", mediaUrl: string | null = null, msgPayload: Record<string, unknown> | null = null;
      if (msg.attachments && msg.attachments.length > 0) { const att = msg.attachments[0]; messageType = att.type || "attachment"; mediaUrl = att.payload?.url || null; msgPayload = { attachments: msg.attachments }; }
      if (msg.quick_reply) msgPayload = { ...(msgPayload || {}), quick_reply: msg.quick_reply };
      await supabase.from("instagram_messages").insert({ tenant_id: channel.tenant_id, thread_id: threadId, provider_message_id: providerMsgId, direction: isIncoming ? "inbound" : "outbound", message_type: messageType, text_body: textBody, media_url: mediaUrl, payload: msgPayload, delivery_status: isIncoming ? "delivered" : "sent" });
    }
  }

  if (event.delivery) { for (const mid of event.delivery.mids || []) { await supabase.from("instagram_messages").update({ delivery_status: "delivered" }).eq("provider_message_id", mid); } }
  if (event.read) { await supabase.from("instagram_messages").update({ delivery_status: "read" }).eq("thread_id", threadId).eq("direction", "outbound").in("delivery_status", ["sent", "delivered"]); }

  let eventType = "unknown";
  if (event.message) eventType = "message";
  else if (event.delivery) eventType = "delivery";
  else if (event.read) eventType = "read";
  else if (event.postback) eventType = "postback";
  else if (event.referral) eventType = "referral";
  await logEvent(supabase, channel, { contact_id: contactId, thread_id: threadId, event_type: eventType, event_source: "messaging", event_time: timestamp, normalized_payload: event });
}

export async function handleWatchlistAutoDm(supabase: Supabase, channel: IgChannel, mediaType: string, _contactIgsid: string, threadId: string, contactId: string) {
  const { data: rules, error: rulesErr } = await supabase.from("instagram_media_watchlist").select("id, reply_public_variants, delay_seconds, first_comment_only, is_active").eq("channel_id", channel.id).eq("media_type", mediaType).eq("is_active", true).limit(1);
  if (rulesErr) { console.error("[watchlist-auto-dm] rules query error:", rulesErr.message); return; }
  if (!rules || rules.length === 0) { console.log("[watchlist-auto-dm] no rules for", mediaType); return; }
  const rule = rules[0];
  const replyText = rule.reply_public_variants?.[0];
  if (!replyText) { console.log("[watchlist-auto-dm] no replyText"); return; }
  const today = new Date().toISOString().substring(0, 10);
  const dedupKey = `${mediaType}:${contactId}:${today}`;
  if (rule.first_comment_only) {
    const { data: existing, error: dedupErr } = await supabase.from("instagram_comment_replies_log").select("id").eq("comment_id", dedupKey).eq("reply_type", mediaType).maybeSingle();
    if (dedupErr) { console.error("[watchlist-auto-dm] dedup query error:", dedupErr.message); return; }
    if (existing) { console.log("[watchlist-auto-dm] dedup blocked for", contactId); return; }
  }
  if (rule.delay_seconds && rule.delay_seconds > 0) await new Promise(r => setTimeout(r, rule.delay_seconds * 1000));
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sendRes = await fetch(`${supabaseUrl}/functions/v1/instagram-send-message`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify({ channel_id: channel.id, contact_id: contactId, thread_id: threadId, text: replyText, idempotency_key: `watchlist_${mediaType}_${contactId}_${rule.id}_${new Date().toISOString().substring(0, 10)}` }) }).catch((e: unknown) => { console.error("[watchlist-auto-dm] fetch error:", e); return null; });
  if (sendRes && !sendRes.ok) { const body = await sendRes.text().catch(() => ""); console.error(`[watchlist-auto-dm] send-message ${sendRes.status}:`, body); return; }
  if (rule.first_comment_only && sendRes?.ok) {
    const { error: insertErr } = await supabase.from("instagram_comment_replies_log").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, comment_id: dedupKey, reply_type: mediaType });
    if (insertErr) console.error("[watchlist-auto-dm] dedup insert error:", insertErr.message);
  }
}
