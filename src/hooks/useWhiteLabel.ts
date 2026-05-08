import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface WhiteLabelConfig {
  id: string;
  tenant_id: string;
  company_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  colors: Record<string, string>;
  custom_domain: string | null;
  domain_verified: boolean;
  hide_branding: boolean;
}

const DEFAULT_COLORS = {
  primary: '#6d28d9',
  secondary: '#a855f7',
  accent: '#f59e0b',
  background: '#0f0f23',
  foreground: '#ffffff',
};

export function useWhiteLabel() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const key = ["whitelabel", tenantId];

  const { data: config, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("tenant_whitelabel")
        .select("id, tenant_id, company_name, logo_url, favicon_url, colors, custom_domain, domain_verified, hide_branding")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as WhiteLabelConfig | null;
    },
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: async (values: Partial<Omit<WhiteLabelConfig, 'id' | 'tenant_id'>>) => {
      if (!tenantId) throw new Error("No tenant");
      if (config) {
        const { error } = await supabase
          .from("tenant_whitelabel")
          .update({ ...values, updated_at: new Date().toISOString() } as any)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_whitelabel").insert({
          tenant_id: tenantId,
          ...values,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Configurações salvas!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    config,
    isLoading,
    save,
    colors: (config?.colors as Record<string, string>) || DEFAULT_COLORS,
    companyName: config?.company_name || 'Spy Pro',
    customDomain: config?.custom_domain || '',
    hideBranding: config?.hide_branding || false,
  };
}
