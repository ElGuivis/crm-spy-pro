import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RFMSnapshot {
  id: string;
  tenant_id?: string;
  integration_id: string;
  source_type: string;
  customer_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_doc: string | null;
  last_order_date: string | null;
  recency_days: number | null;
  orders_count: number | null;
  revenue_total: number | null;
  aov: number | null;
  avg_order_interval_days: number | null;
  r_score: number | null;
  f_score: number | null;
  m_score: number | null;
  rfm_score: string | null;
  segment_name: string | null;
  segment_action: string | null;
  churn_risk: string | null;
  first_purchase_date: string | null;
  ltv_predicted_12m: number | null;
  churn_probability: number | null;
  predicted_next_purchase_date: string | null;
  purchase_probability_7d: number | null;
  purchase_probability_15d: number | null;
  purchase_probability_30d: number | null;
  ideal_offer_window_start: number | null;
  ideal_offer_window_end: number | null;
  reference_date: string;
  created_at: string;
  updated_at?: string;
}

export function useRFMData(integrationId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Latest snapshots
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['rfm-snapshots', integrationId],
    queryFn: async () => {
      const { data: latestDate } = await supabase
        .from('customer_rfm_snapshots')
        .select('reference_date')
        .eq('integration_id', integrationId)
        .order('reference_date', { ascending: false })
        .limit(1)
        .single();

      if (!latestDate) return [];

      // Paginate to fetch ALL snapshots (Supabase default limit is 1000)
      const allSnapshots: RFMSnapshot[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('customer_rfm_snapshots')
          .select('id, integration_id, source_type, customer_id, customer_name, customer_email, customer_phone, customer_doc, last_order_date, recency_days, orders_count, revenue_total, aov, avg_order_interval_days, r_score, f_score, m_score, rfm_score, segment_name, segment_action, churn_risk, first_purchase_date, ltv_predicted_12m, churn_probability, predicted_next_purchase_date, purchase_probability_7d, purchase_probability_15d, purchase_probability_30d, ideal_offer_window_start, ideal_offer_window_end, reference_date, created_at')
          .eq('integration_id', integrationId)
          .eq('reference_date', latestDate.reference_date)
          .order('revenue_total', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allSnapshots.push(...data);
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      return allSnapshots;
    },
    enabled: !!integrationId,
  });

  // Historical data for evolution chart
  const { data: historyData } = useQuery({
    queryKey: ['rfm-history', integrationId],
    queryFn: async () => {
      // Agregado no servidor (antes baixava ~200 mil linhas e esgotava o pool de conexoes)
      const { data: dates, error: datesErr } = await supabase
        .rpc('get_rfm_history', { p_integration_id: integrationId });

      if (datesErr) throw datesErr;
      if (!dates || dates.length === 0) return { history: [], segments: [] };

      const grouped = new Map<string, Record<string, number>>();
      const allSegments = new Set<string>();

      for (const row of dates) {
        const date = row.reference_date;
        const seg = row.segment_name || 'Outros';
        allSegments.add(seg);
        if (!grouped.has(date)) grouped.set(date, {});
        grouped.get(date)![seg] = Number(row.total);
      }

      const history = Array.from(grouped.entries()).map(([date, segments]) => ({
        reference_date: date,
        ...segments,
      }));

      return { history, segments: Array.from(allSegments) };
    },
    enabled: !!integrationId,
  });

  // Migracao entre segmentos: mudancas registradas nos ultimos 30 dias (rfm_segment_changes)
  const { data: migrationData } = useQuery({
    queryKey: ['rfm-migration', integrationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_rfm_migration', { p_integration_id: integrationId, p_days: 30 });
      if (error) throw error;
      return (data || []).map((r) => ({ from: r.from_segment, to: r.to_segment, count: Number(r.customers), revenue: Number(r.revenue) }));
    },
    enabled: !!integrationId,
  });

  const calculateMutation = useMutation({
    mutationFn: async ({ sourceType }: { sourceType: string }) => {
      const { data, error } = await supabase.functions.invoke('rfm-calculator', {
        body: { integration_id: integrationId, source_type: sourceType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rfm-snapshots', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['rfm-history', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['rfm-migration', integrationId] });
      toast({
        title: 'Cálculo RFM concluído',
        description: `${data.total_processed} clientes processados`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro no cálculo RFM',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Derived stats
  const totalClients = snapshots?.length || 0;
  const avgTicket = totalClients > 0
    ? (snapshots!.reduce((sum, s) => sum + (s.aov || 0), 0) / totalClients)
    : 0;
  const repurchaseRate = totalClients > 0
    ? (snapshots!.filter(s => (s.orders_count || 0) > 1).length / totalClients * 100)
    : 0;
  const lastCalculation = snapshots?.[0]?.reference_date || null;

  // Segment distribution
  const segmentDistribution = (snapshots || []).reduce((acc, s) => {
    const seg = s.segment_name || 'Outros';
    if (!acc[seg]) acc[seg] = { count: 0, revenue: 0, totalAov: 0 };
    acc[seg].count++;
    acc[seg].revenue += Number(s.revenue_total || 0);
    acc[seg].totalAov += Number(s.aov || 0);
    return acc;
  }, {} as Record<string, { count: number; revenue: number; totalAov: number }>);

  // Heatmap data (5x5 grid)
  const heatmapData: { r: number; f: number; count: number; avgM: number }[] = [];
  for (let r = 1; r <= 5; r++) {
    for (let f = 1; f <= 5; f++) {
      const matching = (snapshots || []).filter(s => s.r_score === r && s.f_score === f);
      const avgM = matching.length > 0
        ? matching.reduce((sum, s) => sum + (s.revenue_total || 0), 0) / matching.length
        : 0;
      heatmapData.push({ r, f, count: matching.length, avgM });
    }
  }

  // Realtime subscription for auto-refresh when snapshots change
  const rfmChannelInstanceId = useId();
  useEffect(() => {
    if (!integrationId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const channel = supabase
      .channel(`rfm-snapshots-${integrationId}-${rfmChannelInstanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_rfm_snapshots',
          filter: `integration_id=eq.${integrationId}`,
        },
        () => {
          // O calculo grava milhares de linhas: junta os eventos e atualiza uma vez so
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['rfm-snapshots', integrationId] });
            queryClient.invalidateQueries({ queryKey: ['rfm-history', integrationId] });
            queryClient.invalidateQueries({ queryKey: ['rfm-migration', integrationId] });
          }, 4000);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [integrationId, queryClient, rfmChannelInstanceId]);

  return {
    snapshots: snapshots || [],
    isLoading,
    calculateRFM: calculateMutation.mutate,
    isCalculating: calculateMutation.isPending,
    totalClients,
    avgTicket,
    repurchaseRate,
    lastCalculation,
    segmentDistribution,
    heatmapData,
    segmentHistory: historyData?.history || [],
    segmentHistorySegments: historyData?.segments || [],
    migrations: migrationData || [],
  };
}
