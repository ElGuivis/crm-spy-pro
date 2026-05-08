import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CampaignAnalyticsData {
  campaigns: {
    id: string;
    name: string;
    status: string;
    totalContacts: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    deliveryRate: number;
    readRate: number;
    createdAt: string;
  }[];
  totals: { sent: number; delivered: number; read: number; failed: number };
  cashbackStats: { totalCoupons: number; totalExecutions: number; estimatedROI: number };
}

async function fetchCampaignAnalytics(tenantId: string): Promise<CampaignAnalyticsData> {
  const [
    { data: campaigns },
    { data: coupons },
    { data: executions },
  ] = await Promise.all([
    supabase.from("bulk_campaigns").select("id, name, status, total_contacts, sent_count, delivered_count, read_count, failed_count, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
    supabase.from("generated_coupons").select("id, status, discount_value").eq("tenant_id", tenantId).limit(1000),
    supabase.from("cashback_executions").select("id, status, tokens_used").eq("tenant_id", tenantId).limit(1000),
  ]);

  const mappedCampaigns = (campaigns || []).map(c => {
    const sent = c.sent_count || 0;
    const delivered = c.delivered_count || 0;
    const read = c.read_count || 0;
    const failed = c.failed_count || 0;
    return {
      id: c.id, name: c.name, status: c.status,
      totalContacts: c.total_contacts || 0,
      sent, delivered, read, failed,
      deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
      readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
      createdAt: c.created_at,
    };
  });

  const totals = mappedCampaigns.reduce(
    (acc, c) => ({ sent: acc.sent + c.sent, delivered: acc.delivered + c.delivered, read: acc.read + c.read, failed: acc.failed + c.failed }),
    { sent: 0, delivered: 0, read: 0, failed: 0 }
  );

  const totalCoupons = (coupons || []).length;
  const usedCoupons = (coupons || []).filter((c: any) => c.status === "used").length;
  const totalExecutions = (executions || []).filter(e => e.status === "success").length;

  return {
    campaigns: mappedCampaigns,
    totals,
    cashbackStats: {
      totalCoupons,
      totalExecutions,
      estimatedROI: totalCoupons > 0 ? Math.round((usedCoupons / totalCoupons) * 100) : 0,
    },
  };
}

export function useCampaignAnalytics() {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ["campaign-analytics", tenantId],
    queryFn: () => fetchCampaignAnalytics(tenantId!),
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}
