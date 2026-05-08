import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RFMAudienceOption {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  integration_id: string;
  integration_name?: string;
}

/**
 * Hook to fetch all RFM audiences across all integrations for the current tenant.
 * Useful for audience selectors in campaigns.
 */
export function useAllRFMAudiences() {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['all-rfm-audiences', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      // Get all RFM audiences for this tenant
      const { data: audiences, error } = await supabase
        .from('rfm_audiences')
        .select(`
          id,
          name,
          description,
          member_count,
          integration_id,
          is_active
        `)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      // Get integration names
      const integrationIds = [...new Set((audiences || []).map(a => a.integration_id))];
      
      let integrationMap: Record<string, string> = {};
      if (integrationIds.length > 0) {
        const { data: integrations } = await supabase
          .from('integrations')
          .select('id, name')
          .in('id', integrationIds);
        
        integrationMap = (integrations || []).reduce((acc, i) => {
          acc[i.id] = i.name;
          return acc;
        }, {} as Record<string, string>);
      }

      return (audiences || []).map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        member_count: a.member_count,
        integration_id: a.integration_id,
        integration_name: integrationMap[a.integration_id] || 'Desconhecido',
      })) as RFMAudienceOption[];
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}
