import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface TenantApiKey {
  id: string;
  tenant_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'spypro_live_';
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useTenantApiKeys() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const key = ["api-keys", tenantId];

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("tenant_api_keys")
        .select("id, tenant_id, name, key_prefix, last_used_at, is_active, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as TenantApiKey[];
    },
    enabled: !!tenantId,
  });

  const createKey = useMutation({
    mutationFn: async (name: string): Promise<string> => {
      if (!tenantId) throw new Error("No tenant");
      const fullKey = generateApiKey();
      const prefix = fullKey.substring(0, 16) + '...';
      const keyHash = await hashKey(fullKey);
      const { error } = await supabase.from("tenant_api_keys").insert({
        tenant_id: tenantId,
        name,
        key_prefix: prefix,
        key_hash: keyHash,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: key });
      return fullKey;
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_api_keys").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Chave revogada!"); },
    onError: (e: any) => toast.error(e.message),
  });

  return { apiKeys, isLoading, createKey, revokeKey };
}
