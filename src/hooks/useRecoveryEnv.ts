import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStoreBaseUrl } from "@/hooks/useStoreBaseUrl";

export interface EmailIntegrationOption { id: string; name: string; sender_email: string | null; sender_name: string | null }
export interface WhatsAppOption { id: string; name: string; connected: boolean }

/** Integrações que o fluxo pode usar (e-mail e WhatsApp) e o endereço da loja. */
export function useRecoveryEnv() {
  const { tenantId } = useAuth();
  const { baseUrl, save: saveStoreUrl, isLoading: loadingUrl } = useStoreBaseUrl();

  const emails = useQuery<EmailIntegrationOption[]>({
    queryKey: ["recovery-email-integrations", tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_integrations").select("id, name, sender_email, sender_name").eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const whatsapps = useQuery<WhatsAppOption[]>({
    queryKey: ["recovery-whatsapp-integrations", tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("integrations").select("id, name, status").eq("type", "evolution_whatsapp");
      if (error) throw error;
      return (data ?? []).map((i) => ({ id: i.id, name: i.name ?? "WhatsApp", connected: i.status === "connected" }));
    },
  });

  return { storeUrl: baseUrl, saveStoreUrl, loading: loadingUrl || emails.isLoading || whatsapps.isLoading, emailIntegrations: emails.data ?? [], whatsapps: whatsapps.data ?? [] };
}
