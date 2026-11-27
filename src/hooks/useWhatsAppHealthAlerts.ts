import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Alertas abertos dos números de WhatsApp (gravados pelo verificador da VPS a cada 5 min; migration 20261127000002). */
export interface WhatsAppHealthAlert {
  id: string;
  instance_name: string;
  kind: string;
  message: string;
  created_at: string;
  last_seen_at: string;
}

export function useWhatsAppHealthAlerts() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["whatsapp-health-alerts", tenantId],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<WhatsAppHealthAlert[]> => {
      const { data, error } = await supabase
        .from("whatsapp_health_alerts")
        .select("id, instance_name, kind, message, created_at, last_seen_at")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}
