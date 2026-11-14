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
      // Recalculo no servidor: uma chamada so (antes eram centenas de requisicoes do navegador)
      const { data, error } = await supabase.rpc('rfm_refresh_audience', { p_audience_id: audience.id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { count: Number(row?.member_count ?? 0), revenue: Number(row?.total_revenue ?? 0) };
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
