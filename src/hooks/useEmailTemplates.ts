import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Json } from "@/integrations/supabase/types";

export type EmailTemplateType = 'newsletter' | 'promotional' | 'reactivation' | 'launch' | 'relationship';

export interface EmailTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  template_type: EmailTemplateType;
  thumbnail_url: string | null;
  content_html: string | null;
  content_json: Json | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateEmailTemplateInput {
  name: string;
  description?: string;
  template_type: EmailTemplateType;
  thumbnail_url?: string;
  content_html: string;
  content_json?: Json;
}

export function useEmailTemplates() {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['email-templates', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('Tenant not found');

      const { data, error } = await supabase
        .from('email_templates')
        .select('id, tenant_id, name, description, template_type, thumbnail_url, content_html, content_json, is_system, is_active, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: !!tenantId,
  });
}

export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateEmailTemplateInput) => {
      if (!tenantId) throw new Error('Tenant not found');

      const { data, error } = await supabase
        .from('email_templates')
        .insert({
          ...input,
          tenant_id: tenantId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar template: ${error.message}`);
    },
  });
}

export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateEmailTemplateInput> }) => {
      const { data, error } = await supabase
        .from('email_templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();

      if (error) throw error;
      return data?.[0] ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar template: ${error.message}`);
    },
  });
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir template: ${error.message}`);
    },
  });
}

export function useDuplicateEmailTemplate() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error('Tenant not found');

      // Get original template
      const { data: original, error: fetchError } = await supabase
        .from('email_templates')
        .select('name, description, template_type, thumbnail_url, content_html, content_json')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Create duplicate
      const { data, error } = await supabase
        .from('email_templates')
        .insert({
          tenant_id: tenantId,
          name: `${original.name} (Cópia)`,
          description: original.description,
          template_type: original.template_type,
          thumbnail_url: original.thumbnail_url,
          content_html: original.content_html,
          content_json: original.content_json,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template duplicado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao duplicar template: ${error.message}`);
    },
  });
}
