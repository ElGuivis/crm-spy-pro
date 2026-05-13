import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface MetricDaily {
  id: string;
  channel_id: string;
  metric_date: string;
  inbound_messages: number;
  outbound_messages: number;
  new_threads: number;
  flows_started: number;
  flows_completed: number;
  handoffs_to_human: number;
  private_replies_sent: number;
  comment_triggers: number;
  story_reply_triggers: number;
  story_mention_triggers: number;
  ad_entry_triggers: number;
  ref_url_entries: number;
  send_failures: number;
  emails_captured: number;
  phones_captured: number;
  cta_clicks: number;
}

interface ChannelInsight {
  id: string;
  channel_id: string;
  insight_date: string;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  impressions: number | null;
  reach: number | null;
  profile_views: number | null;
  website_clicks: number | null;
}

interface MediaInsight {
  id: string;
  channel_id: string;
  ig_media_id: string;
  media_type: string | null;
  caption: string | null;
  timestamp: string | null;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  plays: number | null;
  permalink: string | null;
  [key: string]: unknown;
}

export function useInstagramReports(channelId: string | null) {
  const { tenantId } = useAuth();
  const [metrics, setMetrics] = useState<MetricDaily[]>([]);
  const [channelInsights, setChannelInsights] = useState<ChannelInsight[]>([]);
  const [mediaInsights, setMediaInsights] = useState<MediaInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30);

  const fetchData = useCallback(async () => {
    if (!channelId) return;
    setIsLoading(true);

    const since = new Date(Date.now() - dateRange * 86400000).toISOString().split("T")[0];

    const [metricsRes, channelRes, mediaRes] = await Promise.all([
      supabase
        .from("instagram_metrics_daily")
        .select("id, channel_id, metric_date, inbound_messages, outbound_messages, new_threads, flows_started, flows_completed, handoffs_to_human, private_replies_sent, comment_triggers, story_reply_triggers, story_mention_triggers, ad_entry_triggers, ref_url_entries, send_failures, emails_captured, phones_captured, cta_clicks")
        .eq("channel_id", channelId)
        .gte("metric_date", since)
        .order("metric_date", { ascending: true }),
      supabase
        .from("instagram_channel_insights")
        .select("id, channel_id, insight_date, followers_count, follows_count, media_count, impressions, reach, profile_views, website_clicks")
        .eq("channel_id", channelId)
        .gte("insight_date", since)
        .order("insight_date", { ascending: true }),
      supabase
        .from("instagram_media_insights")
        .select("id, channel_id, ig_media_id, media_type, caption, timestamp, impressions, reach, likes, comments, saves, shares, plays, permalink")
        .eq("channel_id", channelId)
        .order("timestamp", { ascending: false })
        .limit(50),
    ]);

    setMetrics((metricsRes.data || []) as unknown as MetricDaily[]);
    setChannelInsights((channelRes.data || []) as unknown as ChannelInsight[]);
    setMediaInsights((mediaRes.data || []) as unknown as MediaInsight[]);
    setIsLoading(false);
  }, [channelId, dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totals = metrics.reduce((acc, m) => ({
    inbound: acc.inbound + (m.inbound_messages || 0),
    outbound: acc.outbound + (m.outbound_messages || 0),
    newThreads: acc.newThreads + (m.new_threads || 0),
    flowsStarted: acc.flowsStarted + (m.flows_started || 0),
    flowsCompleted: acc.flowsCompleted + (m.flows_completed || 0),
    handoffs: acc.handoffs + (m.handoffs_to_human || 0),
    privateReplies: acc.privateReplies + (m.private_replies_sent || 0),
    commentTriggers: acc.commentTriggers + (m.comment_triggers || 0),
    storyReplies: acc.storyReplies + (m.story_reply_triggers || 0),
    storyMentions: acc.storyMentions + (m.story_mention_triggers || 0),
    adEntries: acc.adEntries + (m.ad_entry_triggers || 0),
    refUrls: acc.refUrls + (m.ref_url_entries || 0),
    failures: acc.failures + (m.send_failures || 0),
    emails: acc.emails + (m.emails_captured || 0),
    phones: acc.phones + (m.phones_captured || 0),
    ctaClicks: acc.ctaClicks + (m.cta_clicks || 0),
  }), {
    inbound: 0, outbound: 0, newThreads: 0, flowsStarted: 0,
    flowsCompleted: 0, handoffs: 0, privateReplies: 0,
    commentTriggers: 0, storyReplies: 0, storyMentions: 0,
    adEntries: 0, refUrls: 0, failures: 0, emails: 0, phones: 0, ctaClicks: 0,
  });

  return {
    channelId, metrics, channelInsights, mediaInsights, totals,
    isLoading, dateRange, setDateRange, refetch: fetchData,
  };
}
