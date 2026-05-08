import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RFMSnapshot {
  id: string;
  tenant_id: string;
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
  reference_date: string;
  created_at: string;
  updated_at: string;
}

export function useRFMData(integrationId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Latest snapshots
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['rfm-snapshots', integrationId],
    queryFn: async () => {
      const { data: latestDate } = await (supabase as any)
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
        const { data, error } = await (supabase as any)
          .from('customer_rfm_snapshots')
          .select('id, integration_id, source_type, customer_id, customer_name, customer_email, customer_phone, customer_doc, last_order_date, recency_days, orders_count, revenue_total, aov, avg_order_interval_days, r_score, f_score, m_score, rfm_score, segment_name, segment_action, churn_risk, reference_date, created_at')
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
      // Get all distinct reference dates
      const { data: dates, error: datesErr } = await (supabase as any)
        .from('customer_rfm_snapshots')
        .select('reference_date, segment_name')
        .eq('integration_id', integrationId)
        .order('reference_date', { ascending: true });

      if (datesErr) throw datesErr;
      if (!dates || dates.length === 0) return { history: [], segments: [] };

      // Group by reference_date and segment_name
      const grouped = new Map<string, Record<string, number>>();
      const allSegments = new Set<string>();

      for (const row of dates) {
        const date = row.reference_date;
        const seg = row.segment_name || 'Outros';
        allSegments.add(seg);
        if (!grouped.has(date)) grouped.set(date, {});
        const entry = grouped.get(date)!;
        entry[seg] = (entry[seg] || 0) + 1;
      }

      const history = Array.from(grouped.entries()).map(([date, segments]) => ({
        reference_date: date,
        ...segments,
      }));

      return { history, segments: Array.from(allSegments) };
    },
    enabled: !!integrationId,
  });

  // Migration data (compare latest vs previous snapshot)
  const { data: migrationData } = useQuery({
    queryKey: ['rfm-migration', integrationId],
    queryFn: async () => {
      // Get 2 most recent distinct dates
      const { data: dates } = await (supabase as any)
        .from('customer_rfm_snapshots')
        .select('reference_date')
        .eq('integration_id', integrationId)
        .order('reference_date', { ascending: false });

      if (!dates) return [];

      const uniqueDates = [...new Set(dates.map((d: any) => d.reference_date))].slice(0, 2) as string[];
      if (uniqueDates.length < 2) return [];

      const [latestDate, previousDate] = uniqueDates;

      // Fetch both snapshots
      const [{ data: latest }, { data: previous }] = await Promise.all([
        (supabase as any)
          .from('customer_rfm_snapshots')
          .select('customer_id, segment_name, revenue_total')
          .eq('integration_id', integrationId)
          .eq('reference_date', latestDate),
        (supabase as any)
          .from('customer_rfm_snapshots')
          .select('customer_id, segment_name, revenue_total')
          .eq('integration_id', integrationId)
          .eq('reference_date', previousDate),
      ]);

      if (!latest || !previous) return [];

      // Build previous map
      const prevMap = new Map<string, { segment: string; revenue: number }>();
      for (const s of previous) {
        prevMap.set(s.customer_id, { segment: s.segment_name || 'Outros', revenue: Number(s.revenue_total || 0) });
      }

      // Compare
      const flows = new Map<string, { count: number; revenue: number }>();
      for (const s of latest) {
        const prev = prevMap.get(s.customer_id);
        if (!prev) continue;
        const from = prev.segment;
        const to = s.segment_name || 'Outros';
        if (from === to) continue;
        const key = `${from}→${to}`;
        const existing = flows.get(key) || { count: 0, revenue: 0 };
        existing.count++;
        existing.revenue += Number(s.revenue_total || 0);
        flows.set(key, existing);
      }

      return Array.from(flows.entries()).map(([key, data]) => {
        const [from, to] = key.split('→');
        return { from, to, count: data.count, revenue: data.revenue };
      });
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
  useEffect(() => {
    if (!integrationId) return;

    const channel = supabase
      .channel(`rfm-snapshots-${integrationId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_rfm_snapshots',
          filter: `integration_id=eq.${integrationId}`,
        },
        () => {
          // Silently refresh all RFM queries
          queryClient.invalidateQueries({ queryKey: ['rfm-snapshots', integrationId] });
          queryClient.invalidateQueries({ queryKey: ['rfm-history', integrationId] });
          queryClient.invalidateQueries({ queryKey: ['rfm-migration', integrationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [integrationId, queryClient]);

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
