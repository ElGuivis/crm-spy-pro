import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CampaignMetrics {
  // Raw counts
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_complained: number;
  total_unsubscribed: number;
  total_errors: number;

  // Calculated rates (percentage)
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  ctr: number; // click-to-open rate
  bounce_rate: number;
  complaint_rate: number;
  error_rate: number;

  // Events timeline
  events: CampaignEvent[];

  // Logs
  logs: CampaignLog[];
}

export interface CampaignEvent {
  id: string;
  event_type: string;
  recipient_email: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CampaignLog {
  id: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export function useCampaignMetrics(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["campaign-metrics", campaignId],
    queryFn: async (): Promise<CampaignMetrics> => {
      if (!campaignId) {
        throw new Error("Campaign ID is required");
      }

      // Fetch campaign data for totals
      const { data: campaign, error: campaignError } = await supabase
        .from("email_campaigns")
        .select("total_sent, total_delivered, total_opened, total_clicked, total_bounced, total_complained, total_unsubscribed")
        .eq("id", campaignId)
        .single();

      if (campaignError) throw campaignError;

      // Fetch events
      const { data: events, error: eventsError } = await supabase
        .from("email_events")
        .select("id, event_type, recipient_email, metadata, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(500);

      if (eventsError) throw eventsError;

      // Fetch logs
      const { data: logs, error: logsError } = await supabase
        .from("email_campaign_logs")
        .select("id, recipient_email, status, error_message, sent_at, delivered_at, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(500);

      if (logsError) throw logsError;

      // Count errors from logs
      const totalErrors = (logs as any[])?.filter((l) => l.status === "error").length || 0;

      // Calculate metrics
      const totalSent = campaign?.total_sent || 0;
      const totalDelivered = campaign?.total_delivered || 0;
      const totalOpened = campaign?.total_opened || 0;
      const totalClicked = campaign?.total_clicked || 0;
      const totalBounced = campaign?.total_bounced || 0;
      const totalComplained = campaign?.total_complained || 0;
      const totalUnsubscribed = campaign?.total_unsubscribed || 0;

      // Calculate rates
      const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
      const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
      const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0;
      const ctr = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0;
      const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
      const complaintRate = totalDelivered > 0 ? (totalComplained / totalDelivered) * 100 : 0;
      const errorRate = totalSent > 0 ? (totalErrors / totalSent) * 100 : 0;

      return {
        total_sent: totalSent,
        total_delivered: totalDelivered,
        total_opened: totalOpened,
        total_clicked: totalClicked,
        total_bounced: totalBounced,
        total_complained: totalComplained,
        total_unsubscribed: totalUnsubscribed,
        total_errors: totalErrors,
        delivery_rate: Math.round(deliveryRate * 100) / 100,
        open_rate: Math.round(openRate * 100) / 100,
        click_rate: Math.round(clickRate * 100) / 100,
        ctr: Math.round(ctr * 100) / 100,
        bounce_rate: Math.round(bounceRate * 100) / 100,
        complaint_rate: Math.round(complaintRate * 100) / 100,
        error_rate: Math.round(errorRate * 100) / 100,
        events: (events || []) as CampaignEvent[],
        logs: (logs || []) as CampaignLog[],
      };
    },
    enabled: !!campaignId,
    staleTime: 60_000, // Cache for 1 minute
  });
}
