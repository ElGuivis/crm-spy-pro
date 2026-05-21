import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AttributionRow {
  campaign_id: string;
  campaign_name: string;
  sent_count: number;
  opens: number;
  clicks: number;
  attributed_customers: number;
  attributed_revenue: number;
}

export function useRevenueAttribution(lookbackDays = 90) {
  const { tenantId } = useAuth();

  return useQuery<AttributionRow[]>({
    queryKey: ['revenue-attribution', tenantId, lookbackDays],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_revenue_attribution', {
        p_tenant_id: tenantId!,
        p_lookback_days: lookbackDays,
      });
      if (error) throw error;
      return (data || []) as AttributionRow[];
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}
