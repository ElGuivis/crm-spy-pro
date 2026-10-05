import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Json } from "@/integrations/supabase/types";

/** Endereço da empresa que vai no rodapé dos e-mails (guardado em integrations.metadata.footer_address, junto do endereço da loja). */
export function useFooterAddress() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const key = ["footer-address", tenantId];

  const { data: address = null, isLoading } = useQuery<string | null>({
    queryKey: key, enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("integrations").select("metadata").eq("type", "loja_integrada");
      if (error) throw error;
      return (data ?? []).map((i) => (i.metadata as { footer_address?: string } | null)?.footer_address).find(Boolean) ?? null;
    },
  });

  const save = useCallback(async (raw: string): Promise<boolean> => {
    const value = raw.replace(/\s+/g, " ").trim().slice(0, 200);
    if (value.length < 8) return false;
    const { data, error } = await supabase.from("integrations").select("id, metadata").eq("type", "loja_integrada");
    if (error || !data?.length) return false;
    for (const row of data) {
      const metadata = { ...((row.metadata as Record<string, Json> | null) ?? {}), footer_address: value };
      const { error: upErr } = await supabase.from("integrations").update({ metadata }).eq("id", row.id);
      if (upErr) return false;
    }
    queryClient.setQueryData(key, value);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, tenantId]);

  return { address, isLoading, save };
}
