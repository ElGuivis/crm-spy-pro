import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SendProgress {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  total: number;
}

/** Andamento do envio (fila). Atualiza a cada poucos segundos enquanto a campanha está "enviando". */
export function useCampaignProgress(campaignId: string | undefined, active: boolean) {
  const { tenantId } = useAuth();
  return useQuery<SendProgress | null>({
    queryKey: ["campaign-progress", campaignId],
    enabled: !!tenantId && !!campaignId,
    refetchInterval: active ? 4000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_campaign_progress", { p_tenant_id: tenantId!, p_campaign_id: campaignId! });
      if (error) throw error;
      const row = data?.[0];
      return row && Number(row.total) > 0 ? { pending: Number(row.pending), sending: Number(row.sending), sent: Number(row.sent), failed: Number(row.failed), total: Number(row.total) } : null;
    },
  });
}
