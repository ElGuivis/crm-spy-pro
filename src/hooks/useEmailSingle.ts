import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useEmailCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ['email-campaign', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('email_campaigns')
        .select('id, tenant_id, internal_name, subject, sender_name, sender_email, reply_to, preheader, campaign_type, status, content_html, content_json, template_id, email_integration_id, audience_type, audience_reference, has_unsubscribe_link, compliance_checked_at, scheduled_at, started_at, sent_at, completed_at, error_message, total_recipients, total_sent, total_delivered, total_opened, total_clicked, total_bounced, total_complained, total_unsubscribed, is_archived, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useEmailTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['email-template', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('email_templates')
        .select('id, tenant_id, name, description, template_type, content_html, content_json, thumbnail_url, is_active, is_system, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}
