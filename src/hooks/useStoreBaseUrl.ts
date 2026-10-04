import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Json } from "@/integrations/supabase/types";

/** Endereço público da loja (ex.: https://www.minhaloja.com.br). A Loja Integrada só entrega o caminho do produto ("/camiseta-x"). */
export function normalizeStoreUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Monta o link completo do produto a partir do caminho que a loja devolve. */
export function buildProductUrl(baseUrl: string | null, path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (!baseUrl) return "";
  return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function useStoreBaseUrl() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const key = ["store-base-url", tenantId];

  const { data: baseUrl = null, isLoading } = useQuery<string | null>({
    queryKey: key,
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("integrations").select("metadata").eq("type", "loja_integrada");
      if (error) throw error;
      const found = (data ?? []).map((i) => (i.metadata as { store_url?: string } | null)?.store_url).find(Boolean);
      return found ?? null;
    },
  });

  const save = useCallback(async (raw: string): Promise<boolean> => {
    const url = normalizeStoreUrl(raw);
    if (!url) return false;
    const { data, error } = await supabase.from("integrations").select("id, metadata").eq("type", "loja_integrada");
    if (error || !data?.length) return false;
    for (const row of data) {
      const metadata = { ...((row.metadata as Record<string, Json> | null) ?? {}), store_url: url };
      const { error: upErr } = await supabase.from("integrations").update({ metadata }).eq("id", row.id);
      if (upErr) return false;
    }
    queryClient.setQueryData(key, url);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, tenantId]);

  return { baseUrl, isLoading, save };
}
