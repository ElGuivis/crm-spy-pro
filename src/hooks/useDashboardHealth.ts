import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DashboardHealth {
  rfm_age_days: number | null;
  revenue_rpc: number;
  revenue_direct: number;
  revenue_mismatch: boolean;
  unknown_message_directions: number;
}

/** Sinais de dado velho ou divergente do dashboard (RFM desatualizado, receita que não bate com a contagem direta, mensagens com direção desconhecida). */
export function useDashboardHealth() {
  const { tenantId } = useAuth();
  const { data } = useQuery({
    queryKey: ['dashboard-health', tenantId],
    enabled: !!tenantId,
    refetchInterval: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_health' as never, { _tenant_id: tenantId } as never);
      if (error) throw error;
      return data as unknown as DashboardHealth;
    },
  });
  const problems: string[] = [];
  if (data) {
    if (data.rfm_age_days != null && data.rfm_age_days > 2) problems.push(`A matriz RFM está desatualizada há ${data.rfm_age_days} dias.`);
    if (data.revenue_mismatch) problems.push('A receita do mês no dashboard não bate com a contagem direta dos pedidos.');
    if (data.unknown_message_directions > 0) problems.push(`${data.unknown_message_directions} mensagens com direção desconhecida (não entram nos totais).`);
  }
  return problems;
}
