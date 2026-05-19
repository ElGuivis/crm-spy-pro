import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InboxFull {
  id: string;
  tenant_id: string;
  name: string;
  channel_id: string;
  bot_enabled: boolean;
  ai_agent_id: string | null;
  sla_first_response_minutes: number | null;
  sla_resolution_minutes: number | null;
  business_hours_json: Record<string, unknown> | null;
  is_active: boolean;
  integration_id: string | null;
  created_at: string;
  channel?: {
    id: string;
    display_name: string;
    phone_e164: string | null;
    provider: string;
    status: string;
  };
}

export interface WhatsAppChannelFull {
  id: string;
  tenant_id: string;
  provider: string;
  display_name: string;
  phone_e164: string | null;
  status: string;
  created_at: string;
}

export function useInboxesFull() {
  const { tenantId } = useAuth();

  const { data: inboxes = [], isLoading, refetch } = useQuery({
    queryKey: ['inboxes-full', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('inboxes')
        .select('id, tenant_id, name, channel_id, bot_enabled, ai_agent_id, sla_first_response_minutes, sla_resolution_minutes, business_hours_json, is_active, integration_id, created_at, channel:whatsapp_channels(id, display_name, phone_e164, provider, status)')
        .eq('tenant_id', tenantId)
        .order('created_at');
      if (error) throw error;
      return (data || []) as unknown as InboxFull[];
    },
    enabled: !!tenantId,
  });

  return { inboxes, isLoading, refetch };
}

export function useChannels() {
  const { tenantId } = useAuth();

  const { data: channels = [], isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-channels', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('whatsapp_channels')
        .select('id, tenant_id, provider, display_name, phone_e164, status, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at');
      if (error) throw error;
      return (data || []) as unknown as WhatsAppChannelFull[];
    },
    enabled: !!tenantId,
  });

  return { channels, isLoading, refetch };
}

export function useUpdateInbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<InboxFull>) => {
      const { error } = await supabase
        .from('inboxes')
        .update(updates as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboxes-full'] });
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
    },
  });
}

export function useDeleteInbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('inboxes')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboxes-full'] });
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
    },
  });
}

export function useCreateInbox() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  return useMutation({
    mutationFn: async (data: { name: string; channel_id: string; bot_enabled: boolean; sla_first_response_minutes?: number; sla_resolution_minutes?: number; integration_id?: string | null; ai_agent_id?: string | null }) => {
      if (!tenantId) throw new Error('No tenant');
      const { error } = await supabase
        .from('inboxes')
        .insert({ ...data, tenant_id: tenantId, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboxes-full'] });
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
    },
  });
}

export function useOutboundQueueErrors() {
  const { tenantId } = useAuth();

  const { data: errors = [], isLoading } = useQuery({
    queryKey: ['outbound-queue-errors', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('outbound_queue')
        .select('id, to_phone_e164, status, attempts, last_error, created_at, channel_id')
        .eq('tenant_id', tenantId)
        .in('status', ['failed', 'dead'])
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  return { errors, isLoading };
}

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

      // All conversations in period (status + timing + agent + csat)
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
      (periodConvs || []).forEach((c) => {
        statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
      });

      // Daily opened/closed
      const dailyData: Record<string, { opened: number; closed: number }> = {};
      (periodConvs || []).forEach((c) => {
        const day = new Date(c.created_at).toISOString().split('T')[0];
        if (!dailyData[day]) dailyData[day] = { opened: 0, closed: 0 };
        dailyData[day].opened++;
        if (c.status === 'closed') dailyData[day].closed++;
      });

      // SLA metrics from closed conversations that have timing data
      const closedWithTiming = (periodConvs || []).filter(
        (c) => c.status === 'closed' && c.closed_at,
      );
      const resolutionTimes = closedWithTiming.map(
        (c) => (new Date(c.closed_at!).getTime() - new Date(c.created_at).getTime()) / 60000,
      );
      const avgResolutionMinutes = resolutionTimes.length > 0
        ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
        : null;

      const withFirstResponse = (periodConvs || []).filter((c) => c.first_response_at);
      const firstResponseTimes = withFirstResponse.map(
        (c) => (new Date(c.first_response_at!).getTime() - new Date(c.created_at).getTime()) / 60000,
      );
      const avgFirstResponseMinutes = firstResponseTimes.length > 0
        ? Math.round(firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length)
        : null;

      // CSAT
      const withCsat = (periodConvs || []).filter((c) => c.csat_score !== null);
      const csatAvg = withCsat.length > 0
        ? Math.round((withCsat.reduce((a, c) => a + (c.csat_score ?? 0), 0) / withCsat.length) * 10) / 10
        : null;

      // Agent stats — combine open/pending + resolved in period
      const agentMap: Record<string, { open: number; resolved: number; handleTimes: number[] }> = {};
      (periodConvs || []).forEach((c) => {
        if (!c.assigned_to) return;
        if (!agentMap[c.assigned_to]) agentMap[c.assigned_to] = { open: 0, resolved: 0, handleTimes: [] };
        if (c.status === 'closed') {
          agentMap[c.assigned_to].resolved++;
          if (c.closed_at) {
            agentMap[c.assigned_to].handleTimes.push(
              (new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()) / 60000,
            );
          }
        } else {
          agentMap[c.assigned_to].open++;
        }
      });

      // Resolve agent names from profiles
      const agentIds = Object.keys(agentMap);
      let nameMap: Record<string, string> = {};
      if (agentIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, owner_name')
          .in('user_id', agentIds);
        (profiles || []).forEach((p) => {
          nameMap[p.user_id] = p.owner_name || p.user_id.slice(0, 8);
        });
      }

      const agentStats: AgentStats[] = agentIds.map((id) => {
        const a = agentMap[id];
        return {
          agentId: id,
          name: nameMap[id] || id.slice(0, 8),
          openCount: a.open,
          resolvedCount: a.resolved,
          avgHandleMinutes: a.handleTimes.length > 0
            ? Math.round(a.handleTimes.reduce((x, y) => x + y, 0) / a.handleTimes.length)
            : null,
        };
      }).sort((a, b) => (b.openCount + b.resolvedCount) - (a.openCount + a.resolvedCount));

      // Messages today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: messagesToday } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', todayStart.toISOString());

      // Queue health
      const { count: queuePending } = await supabase
        .from('outbound_queue')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending');

      const { count: queueFailed } = await supabase
        .from('outbound_queue')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['failed', 'dead']);

      return {
        statusCounts,
        messagesToday: messagesToday || 0,
        dailyData,
        agentStats,
        queuePending: queuePending || 0,
        queueFailed: queueFailed || 0,
        avgFirstResponseMinutes,
        avgResolutionMinutes,
        csatAvg,
        csatCount: withCsat.length,
      };
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  return { stats, isLoading };
}
