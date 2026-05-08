import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RFMCategorySnapshot {
  id: string;
  tenant_id: string;
  integration_id: string;
  source_type: string;
  customer_id: string;
  customer_name: string | null;
  category_name: string;
  last_order_date: string | null;
  recency_days: number | null;
  orders_count: number | null;
  revenue_total: number | null;
  aov: number | null;
  r_score: number | null;
  f_score: number | null;
  m_score: number | null;
  rfm_score: string | null;
  segment_name: string | null;
  reference_date: string;
}

export function useRFMCategoryData(integrationId: string) {
  // Latest category snapshots
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['rfm-category-snapshots', integrationId],
    queryFn: async () => {
      const { data: latestDate } = await (supabase as any)
        .from('customer_rfm_category_snapshots')
        .select('reference_date')
        .eq('integration_id', integrationId)
        .order('reference_date', { ascending: false })
        .limit(1)
        .single();

      if (!latestDate) return [];

      // Paginate to fetch ALL snapshots (Supabase default limit is 1000)
      const allData: RFMCategorySnapshot[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await (supabase as any)
          .from('customer_rfm_category_snapshots')
          .select('id, integration_id, source_type, customer_id, customer_name, category_name, last_order_date, recency_days, orders_count, revenue_total, aov, r_score, f_score, m_score, rfm_score, segment_name, reference_date')
          .eq('integration_id', integrationId)
          .eq('reference_date', latestDate.reference_date)
          .order('revenue_total', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allData.push(...data);
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      return allData;
    },
    enabled: !!integrationId,
  });

  const allSnapshots = snapshots || [];

  // Derive categories
  const categories = [...new Set(allSnapshots.map(s => s.category_name))].sort();

  // Category summary
  const categorySummary = categories.map(cat => {
    const catSnapshots = allSnapshots.filter(s => s.category_name === cat);
    const totalClients = catSnapshots.length;
    const totalRevenue = catSnapshots.reduce((sum, s) => sum + Number(s.revenue_total || 0), 0);
    const avgTicket = totalClients > 0
      ? catSnapshots.reduce((sum, s) => sum + Number(s.aov || 0), 0) / totalClients
      : 0;

    // Segment distribution within category
    const segments: Record<string, number> = {};
    for (const s of catSnapshots) {
      const seg = s.segment_name || 'Outros';
      segments[seg] = (segments[seg] || 0) + 1;
    }

    // Dominant segment
    const dominantSegment = Object.entries(segments).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Outros';

    return {
      category_name: cat,
      total_clients: totalClients,
      total_revenue: totalRevenue,
      avg_ticket: avgTicket,
      segments,
      dominant_segment: dominantSegment,
    };
  }).sort((a, b) => b.total_revenue - a.total_revenue);

  // Heatmap for selected category
  const getCategoryHeatmap = (categoryName: string) => {
    const catSnapshots = allSnapshots.filter(s => s.category_name === categoryName);
    const heatmapData: { r: number; f: number; count: number; avgM: number }[] = [];
    for (let r = 1; r <= 5; r++) {
      for (let f = 1; f <= 5; f++) {
        const matching = catSnapshots.filter(s => s.r_score === r && s.f_score === f);
        const avgM = matching.length > 0
          ? matching.reduce((sum, s) => sum + Number(s.revenue_total || 0), 0) / matching.length
          : 0;
        heatmapData.push({ r, f, count: matching.length, avgM });
      }
    }
    return heatmapData;
  };

  // Segment distribution for a category
  const getCategorySegmentDistribution = (categoryName: string) => {
    const catSnapshots = allSnapshots.filter(s => s.category_name === categoryName);
    return catSnapshots.reduce((acc, s) => {
      const seg = s.segment_name || 'Outros';
      if (!acc[seg]) acc[seg] = { count: 0, revenue: 0, totalAov: 0 };
      acc[seg].count++;
      acc[seg].revenue += Number(s.revenue_total || 0);
      acc[seg].totalAov += Number(s.aov || 0);
      return acc;
    }, {} as Record<string, { count: number; revenue: number; totalAov: number }>);
  };

  return {
    snapshots: allSnapshots,
    isLoading,
    categories,
    categorySummary,
    getCategoryHeatmap,
    getCategorySegmentDistribution,
  };
}
