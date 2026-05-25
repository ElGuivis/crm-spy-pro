import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/correlation.ts";
import { logEvent } from './messaging-processor.ts';

type Supabase = ReturnType<typeof createClient>;
type Log = ReturnType<typeof createLogger>;

export async function processCommentEvent(supabase: Supabase, channel: { id: string; tenant_id: string }, value: Record<string, unknown>, entryTime: number, log: Log) {
  const commentId = value.id;
  const mediaId = (value.media as Record<string, unknown>)?.id;
  const commentText = (value.text || "") as string;
  const fromId = (value.from as Record<string, unknown>)?.id;
  const timestamp = new Date(entryTime * 1000).toISOString();
  if (!commentId || !fromId) return;

  const isReel = (value.media as Record<string, unknown>)?.media_product_type === "REELS";
  const eventType = isReel ? "reel_comment" : "post_comment";
  await logEvent(supabase, channel, { event_type: eventType, event_source: "comment", event_time: timestamp, normalized_payload: value });

  const { data: rules } = await supabase
    .from("instagram_media_watchlist")
    .select("id, channel_id, watch_mode, media_id, media_type, keywords_include, keywords_exclude, first_comment_only, delay_seconds, reply_public_enabled, reply_public_variants, round_robin_index, private_reply_enabled, private_reply_flow_id, dm_message, keyword_responses, is_active")
    .eq("channel_id", channel.id).eq("is_active", true).in("media_type", [isReel ? "reel" : "post"]);
  if (!rules || rules.length === 0) return;

  for (const rule of rules) {
    if (rule.watch_mode === "specific" && rule.media_id !== mediaId) continue;
    const text = commentText.toLowerCase();
    if (rule.keywords_include?.length > 0) { const hasInclude = rule.keywords_include.some((kw: string) => text.includes(kw.toLowerCase())); if (!hasInclude) continue; }
    if (rule.keywords_exclude?.length > 0) { const hasExclude = rule.keywords_exclude.some((kw: string) => text.includes(kw.toLowerCase())); if (hasExclude) continue; }

    if (rule.first_comment_only) {
      const { data: existing } = await supabase.from("instagram_comment_replies_log").select("id").eq("comment_id", `${fromId}:${mediaId}:first`).maybeSingle();
      if (existing) continue;
    }
    if (rule.delay_seconds > 0) await new Promise(r => setTimeout(r, rule.delay_seconds * 1000));

    let sentAny = false;

    if (rule.reply_public_enabled && rule.reply_public_variants?.length > 0) {
      const idx = rule.round_robin_index % rule.reply_public_variants.length;
      const replyText = rule.reply_public_variants[idx];
      const { error: pubErr } = await supabase.functions.invoke("instagram-send-comment-reply", { body: { channel_id: channel.id, comment_id: commentId, text: replyText } });
      if (pubErr) { log.error("[ig-worker] Comment reply error:", pubErr); }
      else { sentAny = true; await supabase.from("instagram_media_watchlist").update({ round_robin_index: idx + 1 }).eq("id", rule.id); }
    }

    if (rule.private_reply_enabled) {
      if (rule.private_reply_flow_id) {
        await supabase.functions.invoke("instagram-trigger-dispatcher", { body: { event_type: eventType, channel_id: channel.id, thread_id: "pending", contact_id: fromId, tenant_id: channel.tenant_id, message_text: commentText, message_id: commentId } }).catch((e: unknown) => log.error("[ig-worker] Trigger dispatch error:", e));
        sentAny = true;
      } else {
        let dmText: string | null = null;
        const kr = rule.keyword_responses as Array<{ keyword: string; dm_message: string }> | null;
        if (kr && kr.length > 0) { const matched = kr.find((r) => commentText.toLowerCase().includes(r.keyword.toLowerCase())); dmText = matched?.dm_message ?? null; }
        else { dmText = rule.dm_message ?? null; }
        if (dmText) {
          const { error: privErr } = await supabase.functions.invoke("instagram-send-private-reply", { body: { channel_id: channel.id, comment_id: commentId, text: dmText, idempotency_key: `comment_dm:${commentId}:${rule.id}` } });
          if (privErr) { log.error("[ig-worker] Private reply error:", privErr); }
          else { sentAny = true; }
        }
      }
    }

    if (rule.first_comment_only && sentAny) {
      try { await supabase.from("instagram_comment_replies_log").insert({ tenant_id: channel.tenant_id, channel_id: channel.id, comment_id: `${fromId}:${mediaId}:first`, reply_type: "first_check", watchlist_id: rule.id }); }
      catch { /* ignore duplicate */ }
    }
  }
}
