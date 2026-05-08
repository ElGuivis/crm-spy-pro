export interface Campaign {
  id: string;
  name: string;
  message_template: string;
  whatsapp_integration_id: string | null;
  delay_seconds: number;
  status: string;
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  tokens_per_message: number;
  total_tokens_used: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  media_url: string | null;
  media_type: string | null;
  timezone: string | null;
}

export interface WhatsAppIntegration {
  id: string;
  name: string;
  metadata: { instanceName?: string } | null;
}

export interface ContactRow {
  name: string;
  phone: string;
  variables: Record<string, string>;
}

export interface CampaignContact {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  sent_at: string | null;
}
