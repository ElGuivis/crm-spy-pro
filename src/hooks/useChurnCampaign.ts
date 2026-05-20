import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface ChurnCampaignConfig {
  id: string;
  tenant_id: string;
  name: string;
  is_active: boolean;
  churn_threshold: number;
  channel: "whatsapp" | "email";
  whatsapp_integration_id: string | null;
  whatsapp_message: string | null;
  email_subject: string | null;
  email_body: string | null;
  cooldown_days: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useChurnCampaign() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["churn-campaign-config", tenantId],
    queryFn: async (): Promise<ChurnCampaignConfig | null> => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("churn_campaign_configs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ChurnCampaignConfig | null;
    },
    enabled: !!tenantId,
  });

  const statsQuery = useQuery({
    queryKey: ["churn-campaign-stats", tenantId],
    queryFn: async () => {
      if (!tenantId) return { totalTriggeredThisMonth: 0, atRiskCount: 0 };

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [{ count: triggeredCount }, { count: atRiskCount }] = await Promise.all([
        supabase.from("churn_campaign_triggers").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).gte("triggered_at", monthStart),
        supabase.from("customer_rfm_snapshots").select("customer_id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).gte("churn_probability", 0.7),
      ]);

      return { totalTriggeredThisMonth: triggeredCount || 0, atRiskCount: atRiskCount || 0 };
    },
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: async (values: Partial<ChurnCampaignConfig>) => {
      if (!tenantId) throw new Error("Tenant não encontrado");

      if (query.data?.id) {
        const { error } = await supabase.from("churn_campaign_configs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", query.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("churn_campaign_configs").insert({ ...values, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["churn-campaign-config", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (active: boolean) => {
      if (!tenantId) throw new Error("Tenant não encontrado");
      if (query.data?.id) {
        const { error } = await supabase.from("churn_campaign_configs").update({ is_active: active }).eq("id", query.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("churn_campaign_configs").insert({ tenant_id: tenantId, is_active: active });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["churn-campaign-config", tenantId] }),
    onError:   (e: Error) => toast.error(e.message),
  });

  return { config: query.data, isLoading: query.isLoading, stats: statsQuery.data, save, toggle };
}
