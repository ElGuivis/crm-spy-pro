import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface HourStat  { hour_of_day: number; open_count: number }
export interface DayStat   { day_of_week: number; open_count: number }

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function useBestSendTime() {
  const { tenantId } = useAuth();

  const hours = useQuery({
    queryKey: ["best-send-hours", tenantId],
    queryFn: async (): Promise<HourStat[]> => {
      if (!tenantId) return [];
      const { data, error } = await supabase.rpc("get_best_send_hours", { p_tenant_id: tenantId });
      if (error) throw error;
      return (data || []) as HourStat[];
    },
    enabled: !!tenantId,
    staleTime: 60 * 60 * 1000,
  });

  const days = useQuery({
    queryKey: ["best-send-days", tenantId],
    queryFn: async (): Promise<DayStat[]> => {
      if (!tenantId) return [];
      const { data, error } = await supabase.rpc("get_best_send_days", { p_tenant_id: tenantId });
      if (error) throw error;
      return (data || []) as DayStat[];
    },
    enabled: !!tenantId,
    staleTime: 60 * 60 * 1000,
  });

  const topHours  = (hours.data || []).slice(0, 3);
  const topDays   = (days.data  || []).slice(0, 3).map(d => ({ ...d, day_label: DAY_LABELS[d.day_of_week] }));
  const totalOpens = (hours.data || []).reduce((s, h) => s + Number(h.open_count), 0);

  // Best single hour for auto-fill suggestion
  const bestHour = topHours[0]?.hour_of_day ?? null;

  return { topHours, topDays, totalOpens, bestHour, isLoading: hours.isLoading || days.isLoading };
}
