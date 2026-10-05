import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ContactPolicy { enabled: boolean; daily_cap: number; broadcast_gap_hours: number }
export const DEFAULT_POLICY: ContactPolicy = { enabled: true, daily_cap: 3, broadcast_gap_hours: 24 };

/** Regras de contato do tenant (limite diário por pessoa e prioridade do disparo em massa). */
export function useContactPolicy() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const key = ["contact-policy", tenantId];
  const query = useQuery<ContactPolicy>({
    queryKey: key, enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_policies").select("enabled, daily_cap, broadcast_gap_hours").eq("tenant_id", tenantId!).maybeSingle();
      if (error) throw error;
      return data ?? DEFAULT_POLICY;
    },
  });
  const save = useMutation({
    mutationFn: async (patch: Partial<ContactPolicy>) => {
      const { error } = await supabase.from("contact_policies").upsert({ tenant_id: tenantId!, ...(query.data ?? DEFAULT_POLICY), ...patch, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });
  return { policy: query.data ?? DEFAULT_POLICY, isLoading: query.isLoading, save };
}

export interface TouchSummaryRow { purpose: string; channel: string; touches: number; people: number }

/** O que foi enviado (por finalidade e canal) nos últimos dias, vindo do registro único de contatos. */
export function useTouchSummary(days: number) {
  const { tenantId } = useAuth();
  return useQuery<TouchSummaryRow[]>({
    queryKey: ["touch-summary", tenantId, days], enabled: !!tenantId, refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_touch_summary", { p_tenant_id: tenantId!, p_days: days });
      if (error) throw error;
      return (data ?? []) as TouchSummaryRow[];
    },
  });
}
