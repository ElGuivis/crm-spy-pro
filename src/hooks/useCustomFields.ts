import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface CustomField {
  id: string;
  tenant_id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  options: string[] | null;
  sort_order: number;
  created_at: string;
}

export function useCustomFields() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const key = ["custom-fields", tenantId];

  const { data: fields = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("contact_custom_fields")
        .select("id, tenant_id, name, field_type, is_required, options, sort_order, created_at")
        .eq("tenant_id", tenantId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as CustomField[];
    },
    enabled: !!tenantId,
  });

  const createField = useMutation({
    mutationFn: async (field: { name: string; field_type: string; is_required: boolean; options?: string[] }) => {
      if (!tenantId) throw new Error("No tenant");
      const { error } = await supabase.from("contact_custom_fields").insert({
        tenant_id: tenantId,
        name: field.name,
        field_type: field.field_type,
        is_required: field.is_required,
        options: field.options || null,
        sort_order: fields.length,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Campo criado!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_custom_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Campo removido!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { fields, isLoading, createField, deleteField };
}
