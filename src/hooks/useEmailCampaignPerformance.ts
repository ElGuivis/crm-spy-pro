import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type Fns = Database["public"]["Functions"];
export type CampaignPerformance = Fns["get_email_campaign_performance"]["Returns"][number];
export type CampaignConversion = Fns["get_email_campaign_conversions"]["Returns"][number];
export type CampaignTopLink = Fns["get_email_campaign_top_links"]["Returns"][number];

export const ATTRIBUTION_LABELS: Record<string, string> = {
  coupon: "Cupom",
  click: "Clique",
  open: "Abertura",
};

export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

// Recalcula as compras atribuídas (idempotente). Falha aqui não deve esconder os números já gravados.
async function refreshAttribution(tenantId: string) {
  const { error } = await supabase.rpc("refresh_email_campaign_attribution", { p_tenant_id: tenantId });
  if (error) console.warn("[email-attribution] refresh falhou:", error.message);
}

/** Desempenho de todas as campanhas enviadas (aba "Desempenho"). */
export function useEmailCampaignsPerformance() {
  const { tenantId } = useAuth();
  return useQuery<CampaignPerformance[]>({
    queryKey: ["email-performance", tenantId],
    queryFn: async () => {
      await refreshAttribution(tenantId!);
      const { data, error } = await supabase.rpc("get_email_campaign_performance", { p_tenant_id: tenantId! });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}

/** Resultado completo de uma campanha: funil, pedidos atribuídos e links mais clicados. */
export function useCampaignResults(campaignId: string | undefined) {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["campaign-results", campaignId],
    queryFn: async () => {
      await refreshAttribution(tenantId!);
      const args = { p_tenant_id: tenantId!, p_campaign_id: campaignId! };
      const [perf, conv, links] = await Promise.all([
        supabase.rpc("get_email_campaign_performance", args),
        supabase.rpc("get_email_campaign_conversions", args),
        supabase.rpc("get_email_campaign_top_links", args),
      ]);
      if (perf.error) throw perf.error;
      if (conv.error) throw conv.error;
      if (links.error) throw links.error;
      // contadores únicos acabaram de ser gravados: atualiza o resumo da campanha
      queryClient.invalidateQueries({ queryKey: ["campaign-metrics", campaignId] });
      return {
        performance: (perf.data?.[0] ?? null) as CampaignPerformance | null,
        conversions: (conv.data ?? []) as CampaignConversion[],
        links: (links.data ?? []) as CampaignTopLink[],
      };
    },
    enabled: !!tenantId && !!campaignId,
    staleTime: 30_000,
  });
}
