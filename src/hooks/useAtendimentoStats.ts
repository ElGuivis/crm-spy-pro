import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type StatsPeriod = '7d' | '30d' | '90d';

export interface AgentStats {
  agentId: string;
  name: string;
  openCount: number;
  resolvedCount: number;
  avgHandleMinutes: number | null;
}

export interface AtendimentoStatsResult {
  statusCounts: Record<string, number>;
  messagesToday: number;
  dailyData: Record<string, { opened: number; closed: number }>;
  agentStats: AgentStats[];
  queuePending: number;
  queueFailed: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  csatAvg: number | null;
  csatCount: number;
}

export function useOutboundQueueErrors() {
  const { tenantId } = useAuth();
  const { data: errors = [], isLoading } = useQuery({
    queryKey: ['outbound-queue-errors', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.from('outbound_queue').select('id, to_phone_e164, status, attempts, last_error, created_at, channel_id').eq('tenant_id', tenantId).in('status', ['failed', 'dead']).order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });
  return { errors, isLoading };
}

export function useAtendimentoStats(period: StatsPeriod = '7d') {
  const { tenantId } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['atendimento-stats', tenantId, period],
    queryFn: async (): Promise<AtendimentoStatsResult | null> => {
      if (!tenantId) return null;

      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - days);
      const periodStartISO = periodStart.toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: periodConvs } = await (supabase.from('conversations') as any)
        .select('status, assigned_to, created_at, closed_at, first_response_at, csat_score')
        .eq('tenant_id', tenantId)
        .gte('created_at', periodStartISO) as { data: Array<{
          status: string;
          assigned_to: string | null;
          created_at: string;
          closed_at: string | null;
          first_response_at: string | null;
          csat_score: number | null;
        }> | null };

      const statusCounts: Record<string, number> = {};
      (periodConvs || []).forEach((c) => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

      const dailyData: Record<string, { opened: number; closed: number }> = {};
      (periodConvs || []).forEach((c) => {
        const day = new Date(c.created_at).toISOString().split('T')[0];
        if (!dailyData[day]) dailyData[day] = { opened: 0, closed: 0 };
        dailyData[day].opened++;
        if (c.status === 'closed') dailyData[day].closed++;
      });

      const closedWithTiming = (periodConvs || []).filter((c) => c.status === 'closed' && c.closed_at);
      const resolutionTimes = closedWithTiming.map((c) => (new Date(c.closed_at!).getTime() - new Date(c.created_at).getTime()) / 60000);
      const avgResolutionMinutes = resolutionTimes.length > 0 ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) : null;

      const withFirstResponse = (periodConvs || []).filter((c) => c.first_response_at);
      const firstResponseTimes = withFirstResponse.map((c) => (new Date(c.first_response_at!).getTime() - new Date(c.created_at).getTime()) / 60000);
      const avgFirstResponseMinutes = firstResponseTimes.length > 0 ? Math.round(firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length) : null;

      const withCsat = (periodConvs || []).filter((c) => c.csat_score !== null);
      const csatAvg = withCsat.length > 0 ? Math.round((withCsat.reduce((a, c) => a + (c.csat_score ?? 0), 0) / withCsat.length) * 10) / 10 : null;

      const agentMap: Record<string, { open: number; resolved: number; handleTimes: number[] }> = {};
      (periodConvs || []).forEach((c) => {
        if (!c.assigned_to) return;
        if (!agentMap[c.assigned_to]) agentMap[c.assigned_to] = { open: 0, resolved: 0, handleTimes: [] };
        if (c.status === 'closed') {
          agentMap[c.assigned_to].resolved++;
          if (c.closed_at) agentMap[c.assigned_to].handleTimes.push((new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()) / 60000);
        } else {
          agentMap[c.assigned_to].open++;
        }
      });

      const agentIds = Object.keys(agentMap);
      let nameMap: Record<string, string> = {};
      if (agentIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, owner_name').in('user_id', agentIds);
        (profiles || []).forEach((p) => { nameMap[p.user_id] = p.owner_name || p.user_id.slice(0, 8); });
      }

      const agentStats: AgentStats[] = agentIds.map((id) => {
        const a = agentMap[id];
        return { agentId: id, name: nameMap[id] || id.slice(0, 8), openCount: a.open, resolvedCount: a.resolved, avgHandleMinutes: a.handleTimes.length > 0 ? Math.round(a.handleTimes.reduce((x, y) => x + y, 0) / a.handleTimes.length) : null };
      }).sort((a, b) => (b.openCount + b.resolvedCount) - (a.openCount + a.resolvedCount));

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: messagesToday } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStart.toISOString());

      const { count: queuePending } = await supabase.from('outbound_queue').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pending');
      const { count: queueFailed } = await supabase.from('outbound_queue').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['failed', 'dead']);

      return { statusCounts, messagesToday: messagesToday || 0, dailyData, agentStats, queuePending: queuePending || 0, queueFailed: queueFailed || 0, avgFirstResponseMinutes, avgResolutionMinutes, csatAvg, csatCount: withCsat.length };
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  return { stats, isLoading };
}
