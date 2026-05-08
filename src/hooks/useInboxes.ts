import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface WhatsAppChannel {
  id: string;
  tenant_id: string;
  provider: 'evolution' | 'meta';
  display_name: string;
  phone_e164: string | null;
  status: 'connected' | 'disconnected';
  integration_id: string | null;
  created_at: string;
}

export interface Inbox {
  id: string;
  tenant_id: string;
  name: string;
  channel_id: string;
  bot_enabled: boolean;
  is_active: boolean;
  integration_id: string | null;
  created_at: string;
  channel?: WhatsAppChannel;
}

export function useInboxes() {
  const { tenantId } = useAuth();

  const { data: inboxes = [], isLoading } = useQuery({
    queryKey: ['inboxes', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('inboxes')
        .select('id, tenant_id, name, channel_id, bot_enabled, is_active, integration_id, created_at, channel:whatsapp_channels(id, tenant_id, provider, display_name, phone_e164, status, integration_id, created_at)')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at');
      if (error) throw error;
      return (data || []) as unknown as Inbox[];
    },
    enabled: !!tenantId,
  });

  return { inboxes, isLoading };
}
