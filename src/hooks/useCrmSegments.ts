import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface CrmSegment {
  id: string;
  tenant_id: string;
  name: string;
  filters: { field: string; operator: string; value: string }[];
  contact_count: number;
  last_computed_at: string | null;
  created_at: string;
}

export function useCrmSegments() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const key = ["crm-segments", tenantId];

  const { data: segments = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("crm_segments")
        .select("id, tenant_id, name, filters, contact_count, last_computed_at, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CrmSegment[];
    },
    enabled: !!tenantId,
  });

  const createSegment = useMutation({
    mutationFn: async (seg: { name: string; filters: any[] }) => {
      if (!tenantId) throw new Error("No tenant");
      const { error } = await supabase.from("crm_segments").insert({
        tenant_id: tenantId,
        name: seg.name,
        filters: seg.filters,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Segmento criado!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Segmento removido!"); },
    onError: (e: any) => toast.error(e.message),
  });

  return { segments, isLoading, createSegment, deleteSegment };
}
