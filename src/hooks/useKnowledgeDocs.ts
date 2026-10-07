import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface KnowledgeDoc {
  id: string;
  title: string;
  category: string | null;
  content: string;
  is_active: boolean;
}

export interface KnowledgeDocInput {
  id?: string;
  title: string;
  category: string;
  content: string;
  is_active: boolean;
}

export const KNOWLEDGE_LIMITS = { title: 200, category: 100, content: 6000 } as const;

/** Documentos curtos da loja (FAQ, políticas, guias) que a IA consulta. Cada loja vê só os seus. */
export function useKnowledgeDocs() {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["knowledge-docs", tenantId];

  const { data: docs = [], isLoading } = useQuery({
    queryKey,
    enabled: !!tenantId,
    queryFn: async (): Promise<KnowledgeDoc[]> => {
      const { data, error } = await supabase
        .from("tenant_knowledge_docs")
        .select("id, title, category, content, is_active")
        .eq("tenant_id", tenantId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const fail = (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`);

  const save = useMutation({
    mutationFn: async (input: KnowledgeDocInput) => {
      if (!tenantId) throw new Error("Sem tenant");
      const row = { title: input.title.trim(), category: input.category.trim() || null, content: input.content.trim(), is_active: input.is_active, updated_by: user?.id ?? null };
      const query = input.id
        ? supabase.from("tenant_knowledge_docs").update(row).eq("id", input.id).eq("tenant_id", tenantId)
        : supabase.from("tenant_knowledge_docs").insert({ ...row, tenant_id: tenantId });
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Documento salvo"); },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Sem tenant");
      const { error } = await supabase.from("tenant_knowledge_docs").delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Documento excluído"); },
    onError: fail,
  });

  return { docs, isLoading, save, remove };
}
