import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/correlation.ts";
import { logEvent, type IgChannel } from './messaging-processor.ts';

type Supabase = ReturnType<typeof createClient>;
type Log = ReturnType<typeof createLogger>;

export async function processStoryMentionEvent(supabase: Supabase, channel: { id: string; tenant_id: string }, value: Record<string, unknown>, entryTime: number, log: Log) {
  const timestamp = new Date(entryTime * 1000).toISOString();
  const mentionerId = (value.sender_id || (value.from as Record<string, unknown>)?.id) as string | undefined;
  await logEvent(supabase, channel, { event_type: "story_mention", event_source: "story", event_time: timestamp, normalized_payload: value });

  const { data: rules } = await supabase.from("instagram_media_watchlist").select("id, private_reply_flow_id, reply_public_variants, is_active").eq("channel_id", channel.id).eq("is_active", true).eq("media_type", "story_mention");
  if (!rules || rules.length === 0 || !mentionerId) return;

  for (const rule of rules) {
    const { data: recent } = await supabase.from("instagram_comment_replies_log").select("id").eq("comment_id", `mention:${mentionerId}`).eq("reply_type", "story_mention").gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).maybeSingle();
    if (recent) continue;

    await supabase.from("instagram_comment_replies_log").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, comment_id: `mention:${mentionerId}`, reply_type: "story_mention" }).catch(() => {});

    if (rule.private_reply_flow_id) {
      await supabase.functions.invoke("instagram-trigger-dispatcher", { body: { event_type: "story_mention", channel_id: channel.id, thread_id: "pending", contact_id: mentionerId, tenant_id: channel.tenant_id, message_text: "", message_id: `mention:${Date.now()}` } }).catch((e: unknown) => log.error("[ig-worker] Story mention trigger error:", e));
    } else if (rule.reply_public_variants?.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const replyText = rule.reply_public_variants[0];

      const { data: contact } = await supabase.from("instagram_contacts").select("id").eq("channel_id", channel.id).eq("igsid", mentionerId).maybeSingle();
      let contactId = contact?.id;
      if (!contactId) {
        const { data: newContact } = await supabase.from("instagram_contacts").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, igsid: mentionerId, source_first_entry: "story_mention" }).select("id").single();
        contactId = newContact?.id;
      }
      if (contactId) {
        const { data: thread } = await supabase.from("instagram_threads").select("id").eq("channel_id", channel.id).eq("contact_id", contactId).maybeSingle();
        let threadId = thread?.id;
        if (!threadId) {
          const { data: newThread } = await supabase.from("instagram_threads").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, contact_id: contactId, thread_status: "active", current_mode: "bot" }).select("id").single();
          threadId = newThread?.id;
        }
        if (threadId) {
          await fetch(`${supabaseUrl}/functions/v1/instagram-send-message`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify({ channel_id: channel.id, thread_id: threadId, text: replyText, idempotency_key: `watchlist_story_mention_${contactId}_${rule.id}` }) }).catch(() => {});
        }
      }
    }
  }
}

export async function processFollowEvent(supabase: Supabase, channel: IgChannel, value: Record<string, unknown>, entryTime: number, log: Log) {
  const timestamp = new Date(entryTime * 1000).toISOString();
  const followerId = ((value.from as Record<string, unknown>)?.id || value.sender_id) as string | undefined;
  await logEvent(supabase, channel, { event_type: "follow", event_source: "follow", event_time: timestamp, normalized_payload: value });
  if (!followerId) return;

  const { data: existingContact } = await supabase.from("instagram_contacts").select("id").eq("channel_id", channel.id).eq("igsid", followerId).maybeSingle();
  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    await supabase.from("instagram_contacts").update({ last_seen_at: timestamp, updated_at: new Date().toISOString() }).eq("id", contactId);
  } else {
    const { data: newContact } = await supabase.from("instagram_contacts").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, igsid: followerId, first_seen_at: timestamp, last_seen_at: timestamp, source_first_entry: "follow" }).select("id").single();
    contactId = newContact!.id;
  }

  await supabase.functions.invoke("instagram-experimental-trigger", { body: { channel_id: channel.id, contact_id: contactId, tenant_id: channel.tenant_id, event_type: "follow_to_dm" } }).catch((e: unknown) => log.warn("[ig-worker] Follow-to-DM trigger error:", e));
}

export async function processShareToDmEvent(supabase: Supabase, channel: IgChannel, value: Record<string, unknown>, entryTime: number, log: Log) {
  const timestamp = new Date(entryTime * 1000).toISOString();
  const senderId = ((value.sender as Record<string, unknown>)?.id || (value.from as Record<string, unknown>)?.id) as string | undefined;
  await logEvent(supabase, channel, { event_type: "share_to_dm", event_source: "share", event_time: timestamp, normalized_payload: value });
  if (!senderId) return;

  const { data: existingContact } = await supabase.from("instagram_contacts").select("id").eq("channel_id", channel.id).eq("igsid", senderId).maybeSingle();
  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    await supabase.from("instagram_contacts").update({ last_seen_at: timestamp, updated_at: new Date().toISOString() }).eq("id", contactId);
  } else {
    const { data: newContact } = await supabase.from("instagram_contacts").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, igsid: senderId, first_seen_at: timestamp, last_seen_at: timestamp, source_first_entry: "share" }).select("id").single();
    contactId = newContact!.id;
  }

  await supabase.functions.invoke("instagram-experimental-trigger", { body: { channel_id: channel.id, contact_id: contactId, tenant_id: channel.tenant_id, event_type: "share_to_dm" } }).catch((e: unknown) => log.warn("[ig-worker] Share-to-DM trigger error:", e));
}
