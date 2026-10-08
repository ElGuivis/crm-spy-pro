import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AtendimentoHealth {
  pending_handoff: number;
  oldest_handoff_minutes: number;
  queued_over_5min: number;
  stuck_in_queue: number;
  failed_messages_24h: number;
  dead_letters_24h: number;
  duplicate_suspects_24h: number;
  circuit_open: boolean;
  checked_at: string;
}

export function useAtendimentoHealth() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["atendimento-health", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_atendimento_health", { p_tenant: tenantId! });
      if (error) throw error;
      return data as unknown as AtendimentoHealth;
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });
}
