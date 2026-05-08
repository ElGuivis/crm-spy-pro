import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export type EmailCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'canceled' | 'error';
export type EmailCampaignType = 'newsletter' | 'promotion' | 'relationship' | 'automation' | 'update';

export interface EmailCampaign {
  id: string;
  tenant_id: string;
  internal_name: string;
  subject: string;
  preheader: string | null;
  sender_name: string;
  sender_email: string;
  reply_to: string | null;
  campaign_type: EmailCampaignType;
  template_id: string | null;
  content_html: string | null;
  content_json: any;
  audience_type: string | null;
  audience_reference: string | null;
  status: EmailCampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_complained: number;
  error_message: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateEmailCampaignInput {
  internal_name: string;
  subject: string;
  preheader?: string;
  sender_name: string;
  sender_email: string;
  reply_to?: string;
  campaign_type: EmailCampaignType;
  template_id?: string;
  content_html?: string;
  content_json?: any;
  audience_type?: string;
  audience_reference?: string;
  scheduled_at?: string;
  email_integration_id?: string;
}

export function useEmailCampaigns(filters?: {
  status?: EmailCampaignStatus;
  search?: string;
  showArchived?: boolean;
}) {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['email-campaigns', tenantId, filters],
    queryFn: async () => {
      if (!tenantId) throw new Error('Tenant not found');

      let query = supabase
        .from('email_campaigns')
        .select('id, tenant_id, internal_name, subject, preheader, sender_name, sender_email, reply_to, campaign_type, template_id, content_html, content_json, audience_type, audience_reference, email_integration_id, status, scheduled_at, started_at, completed_at, sent_at, total_recipients, total_sent, total_delivered, total_opened, total_clicked, total_bounced, total_complained, error_message, is_archived, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (!filters?.showArchived) {
        query = query.eq('is_archived', false);
      }

      if (filters?.search) {
        query = query.or(`internal_name.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as EmailCampaign[];
    },
    enabled: !!tenantId,
  });
}

export function useCreateEmailCampaign() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateEmailCampaignInput) => {
      if (!tenantId) throw new Error('Tenant not found');

      const { data, error } = await supabase
        .from('email_campaigns')
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
      queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
      toast.success('Campanha criada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar campanha: ${error.message}`);
    },
  });
}

export function useUpdateEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateEmailCampaignInput> & { status?: "canceled" | "draft" | "error" | "paused" | "scheduled" | "sending" | "sent" } }) => {
      const { data, error } = await supabase
        .from('email_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
      toast.success('Campanha atualizada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar campanha: ${error.message}`);
    },
  });
}

export function useDeleteEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
      toast.success('Campanha excluída com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir campanha: ${error.message}`);
    },
  });
}

export function useArchiveEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_campaigns')
        .update({ is_archived: true })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
      toast.success('Campanha arquivada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao arquivar campanha: ${error.message}`);
    },
  });
}

export function useDuplicateEmailCampaign() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error('Tenant not found');

      // Get original campaign
      const { data: original, error: fetchError } = await supabase
        .from('email_campaigns')
        .select('internal_name, subject, preheader, sender_name, sender_email, reply_to, campaign_type, template_id, content_html, content_json, audience_type, audience_reference, email_integration_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Create duplicate
      const { data, error } = await supabase
        .from('email_campaigns')
        .insert({
          tenant_id: tenantId,
          internal_name: `${original.internal_name} (Cópia)`,
          subject: original.subject,
          preheader: original.preheader,
          sender_name: original.sender_name,
          sender_email: original.sender_email,
          reply_to: original.reply_to,
          campaign_type: original.campaign_type,
          template_id: original.template_id,
          content_html: original.content_html,
          content_json: original.content_json,
          audience_type: original.audience_type,
          audience_reference: original.audience_reference,
          email_integration_id: original.email_integration_id,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
      toast.success('Campanha duplicada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao duplicar campanha: ${error.message}`);
    },
  });
}
