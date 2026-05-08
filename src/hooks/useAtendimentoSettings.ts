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

export function useAtendimentoStats() {
  const { tenantId } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['atendimento-stats', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      // Total conversations by status
      const { data: convByStatus } = await supabase
        .from('conversations')
        .select('status')
        .eq('tenant_id', tenantId);

      const statusCounts: Record<string, number> = {};
      (convByStatus || []).forEach((c) => {
        statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
      });

      // Messages today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: messagesToday } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', todayStart.toISOString());

      // Conversations created in last 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: recentConversations } = await supabase
        .from('conversations')
        .select('created_at, status')
        .eq('tenant_id', tenantId)
        .gte('created_at', weekAgo.toISOString())
        .order('created_at');

      // Group by day
      const dailyData: Record<string, { opened: number; closed: number }> = {};
      (recentConversations || []).forEach((c) => {
        const day = new Date(c.created_at).toISOString().split('T')[0];
        if (!dailyData[day]) dailyData[day] = { opened: 0, closed: 0 };
        dailyData[day].opened++;
        if (c.status === 'closed') dailyData[day].closed++;
      });

      // Conversations by assigned_to
      const { data: convByAgent } = await supabase
        .from('conversations')
        .select('assigned_to')
        .eq('tenant_id', tenantId)
        .not('assigned_to', 'is', null)
        .in('status', ['open', 'pending']);

      const agentCounts: Record<string, number> = {};
      (convByAgent || []).forEach((c) => {
        agentCounts[c.assigned_to!] = (agentCounts[c.assigned_to!] || 0) + 1;
      });

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
        agentCounts,
        queuePending: queuePending || 0,
        queueFailed: queueFailed || 0,
      };
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  return { stats, isLoading };
}
