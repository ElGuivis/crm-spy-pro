import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type SuppressionReason = "unsubscribed" | "bounced" | "complained" | "invalid" | "blocked";

export interface SuppressionEntry {
  id: string;
  tenant_id: string;
  email: string;
  reason: SuppressionReason;
  source: string | null;
  campaign_id: string | null;
  created_at: string;
}

export function useSuppressionList(filters?: {
  reason?: SuppressionReason;
  search?: string;
  limit?: number;
}) {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const key = ["suppression-list", tenantId, filters];

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!tenantId) return [];

      let query = supabase
        .from("email_suppression_list")
        .select("id, tenant_id, email, reason, source, campaign_id, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (filters?.reason) {
        query = query.eq("reason", filters.reason);
      }

      if (filters?.search) {
        query = query.ilike("email", `%${filters.search}%`);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SuppressionEntry[];
    },
    enabled: !!tenantId,
  });

  // Count by reason — use individual count queries instead of loading all rows
  const reasons: SuppressionReason[] = ["unsubscribed", "bounced", "complained", "invalid", "blocked"];

  const { data: counts } = useQuery({
    queryKey: ["suppression-counts", tenantId],
    queryFn: async () => {
      if (!tenantId) return { total: 0, unsubscribed: 0, bounced: 0, complained: 0, invalid: 0, blocked: 0 };

      // Fetch total count
      const { count: total, error: totalErr } = await supabase
        .from("email_suppression_list")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

      if (totalErr) throw totalErr;

      // Fetch counts per reason in parallel
      const reasonCounts = await Promise.all(
        reasons.map(async (reason) => {
          const { count, error } = await supabase
            .from("email_suppression_list")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("reason", reason);
          if (error) throw error;
          return { reason, count: count || 0 };
        })
      );

      const result: Record<string, number> = { total: total || 0 };
      reasonCounts.forEach(({ reason, count }) => {
        result[reason] = count;
      });

      return result as { total: number; unsubscribed: number; bounced: number; complained: number; invalid: number; blocked: number };
    },
    enabled: !!tenantId,
  });

  const addEmail = useMutation({
    mutationFn: async ({ email, reason, source }: { email: string; reason: SuppressionReason; source?: string }) => {
      if (!tenantId) throw new Error("Tenant not found");

      const { error } = await supabase.from("email_suppression_list").upsert(
        {
          tenant_id: tenantId,
          email: email.toLowerCase().trim(),
          reason,
          source: source || "manual",
        },
        { onConflict: "tenant_id,email" }
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression-list"] });
      queryClient.invalidateQueries({ queryKey: ["suppression-counts"] });
      toast.success("E-mail adicionado à lista de supressão");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao adicionar: ${error.message}`);
    },
  });

  const removeEmail = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_suppression_list").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression-list"] });
      queryClient.invalidateQueries({ queryKey: ["suppression-counts"] });
      toast.success("E-mail removido da lista de supressão");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao remover: ${error.message}`);
    },
  });

  return {
    entries: data || [],
    counts: counts || { total: 0, unsubscribed: 0, bounced: 0, complained: 0, invalid: 0, blocked: 0 },
    isLoading,
    error,
    addEmail,
    removeEmail,
  };
}
