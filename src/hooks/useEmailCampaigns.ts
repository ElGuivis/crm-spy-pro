import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  ab_test_id: string | null;
  ab_variant: string | null;
  ab_split_pct: number;
  ab_offset_pct: number;
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

export function useEmailCampaigns(filters?: { status?: EmailCampaignStatus; search?: string; showArchived?: boolean }) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['email-campaigns', tenantId, filters],
    queryFn: async () => {
      if (!tenantId) throw new Error('Tenant not found');
      let query = supabase.from('email_campaigns').select('id, tenant_id, internal_name, subject, preheader, sender_name, sender_email, reply_to, campaign_type, template_id, content_html, content_json, audience_type, audience_reference, email_integration_id, status, scheduled_at, started_at, completed_at, sent_at, total_recipients, total_sent, total_delivered, total_opened, total_clicked, total_bounced, total_complained, error_message, is_archived, created_at, updated_at, ab_test_id, ab_variant, ab_split_pct, ab_offset_pct').eq('tenant_id', tenantId).order('created_at', { ascending: false });
      if (filters?.status) query = query.eq('status', filters.status);
      if (!filters?.showArchived) query = query.eq('is_archived', false);
      if (filters?.search) query = query.or(`internal_name.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data as EmailCampaign[];
    },
    enabled: !!tenantId,
  });
}

export * from './useEmailCampaignMutations';
