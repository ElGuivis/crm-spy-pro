import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface AudienceRule {
  r_min?: number;
  r_max?: number;
  f_min?: number;
  f_max?: number;
  m_min?: number;
  m_max?: number;
  segment_name?: string;
  churn_risk?: string;
  min_revenue?: number;
  max_revenue?: number;
  min_orders?: number;
  max_orders?: number;
  min_aov?: number;
  max_aov?: number;
}

export interface RFMAudience {
  id: string;
  tenant_id: string;
  integration_id: string;
  name: string;
  description: string | null;
  rules: AudienceRule;
  member_count: number;
  total_revenue: number;
  is_active: boolean;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useRFMAudiences(integrationId: string) {
  const { toast } = useToast();
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  const { data: audiences, isLoading } = useQuery({
    queryKey: ['rfm-audiences', integrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rfm_audiences')
        .select('id, tenant_id, integration_id, name, description, rules, member_count, total_revenue, is_active, last_calculated_at, created_at, updated_at')
        .eq('integration_id', integrationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as RFMAudience[];
    },
    enabled: !!integrationId,
  });

  const createAudience = useMutation({
    mutationFn: async (input: { name: string; description?: string; rules: AudienceRule }) => {
      if (!tenantId) throw new Error('Tenant not found');
      const payload = {
          tenant_id: tenantId,
          integration_id: integrationId,
          name: input.name,
          description: input.description || null,
          rules: JSON.parse(JSON.stringify(input.rules)),
        };
      const { data, error } = await supabase
        .from('rfm_audiences')
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfm-audiences', integrationId] });
      toast({ title: 'Audiência criada' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao criar audiência', description: e.message, variant: 'destructive' });
    },
  });

  const deleteAudience = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('rfm_audiences')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfm-audiences', integrationId] });
      toast({ title: 'Audiência excluída' });
    },
  });

  const recalculateAudience = useMutation({
    mutationFn: async (audience: RFMAudience) => {
      // Get latest snapshot date
      const { data: latestDate } = await supabase
        .from('customer_rfm_snapshots')
        .select('reference_date')
        .eq('integration_id', integrationId)
        .order('reference_date', { ascending: false })
        .limit(1)
        .single();

      if (!latestDate) throw new Error('Nenhum snapshot RFM encontrado');

      // Build query with filters from rules
      let query = supabase
        .from('customer_rfm_snapshots')
        .select('id, revenue_total')
        .eq('integration_id', integrationId)
        .eq('reference_date', latestDate.reference_date);

      const rules = audience.rules;
      if (rules.r_min) query = query.gte('r_score', rules.r_min);
      if (rules.r_max) query = query.lte('r_score', rules.r_max);
      if (rules.f_min) query = query.gte('f_score', rules.f_min);
      if (rules.f_max) query = query.lte('f_score', rules.f_max);
      if (rules.m_min) query = query.gte('m_score', rules.m_min);
      if (rules.m_max) query = query.lte('m_score', rules.m_max);
      if (rules.segment_name) query = query.eq('segment_name', rules.segment_name);
      if (rules.churn_risk) query = query.eq('churn_risk', rules.churn_risk);
      if (rules.min_revenue) query = query.gte('revenue_total', rules.min_revenue);
      if (rules.max_revenue) query = query.lte('revenue_total', rules.max_revenue);
      if (rules.min_orders) query = query.gte('orders_count', rules.min_orders);
      if (rules.max_orders) query = query.lte('orders_count', rules.max_orders);
      if (rules.min_aov) query = query.gte('aov', rules.min_aov);
      if (rules.max_aov) query = query.lte('aov', rules.max_aov);

      const { data: matchingSnapshots, error } = await query;
      if (error) throw error;

      const members = matchingSnapshots || [];
      const totalRevenue = members.reduce((sum: number, m) => sum + Number(m.revenue_total || 0), 0);

      // Clear old members
      await supabase
        .from('rfm_audience_members')
        .delete()
        .eq('audience_id', audience.id);

      // Insert new members in batches
      if (members.length > 0) {
        const rows = members.map((m) => ({
          audience_id: audience.id,
          snapshot_id: m.id,
          tenant_id: audience.tenant_id,
        }));
        for (let i = 0; i < rows.length; i += 500) {
          await supabase
            .from('rfm_audience_members')
            .insert(rows.slice(i, i + 500));
        }
      }

      // Update audience stats
      await supabase
        .from('rfm_audiences')
        .update({
          member_count: members.length,
          total_revenue: totalRevenue,
          last_calculated_at: new Date().toISOString(),
        })
        .eq('id', audience.id);

      return { count: members.length, revenue: totalRevenue };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rfm-audiences', integrationId] });
      toast({ title: 'Audiência recalculada', description: `${data.count} membros encontrados` });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao recalcular', description: e.message, variant: 'destructive' });
    },
  });

  return {
    audiences: audiences || [],
    isLoading,
    createAudience: createAudience.mutate,
    isCreating: createAudience.isPending,
    deleteAudience: deleteAudience.mutate,
    recalculateAudience: recalculateAudience.mutate,
    isRecalculating: recalculateAudience.isPending,
  };
}
