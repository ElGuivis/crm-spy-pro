import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface RoutingRule {
  id: string;
  tenant_id: string;
  name: string;
  channel: string;
  condition_type: string;
  condition_value: string | null;
  target_type: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export function useRoutingRules() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const key = ["routing-rules", tenantId];

  const { data: rules = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("inbox_routing_rules")
        .select("id, tenant_id, name, channel, condition_type, condition_value, target_type, is_active, sort_order, created_at")
        .eq("tenant_id", tenantId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as RoutingRule[];
    },
    enabled: !!tenantId,
  });

  const createRule = useMutation({
    mutationFn: async (rule: { name: string; channel: string; condition_type: string; condition_value?: string; target_type: string }) => {
      if (!tenantId) throw new Error("No tenant");
      const { error } = await supabase.from("inbox_routing_rules").insert({
        tenant_id: tenantId,
        ...rule,
        sort_order: rules.length,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Regra criada!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("inbox_routing_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inbox_routing_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Regra removida!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { rules, isLoading, createRule, toggleRule, deleteRule };
}
