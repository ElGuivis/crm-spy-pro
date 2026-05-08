import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface TenantWebhook {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  success_count: number;
  failure_count: number;
  created_at: string;
}

export function useTenantWebhooks() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const key = ["tenant-webhooks", tenantId];

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("tenant_webhooks")
        .select("id, tenant_id, name, url, events, is_active, last_triggered_at, success_count, failure_count, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at");
      if (error) throw error;
      return (data || []) as TenantWebhook[];
    },
    enabled: !!tenantId,
  });

  const createWebhook = useMutation({
    mutationFn: async (wh: { name: string; url: string; events: string[] }) => {
      if (!tenantId) throw new Error("No tenant");
      const { error } = await supabase.from("tenant_webhooks").insert({
        tenant_id: tenantId,
        name: wh.name,
        url: wh.url,
        events: wh.events,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Webhook criado!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleWebhook = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("tenant_webhooks").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_webhooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Webhook removido!"); },
    onError: (e: any) => toast.error(e.message),
  });

  return { webhooks, isLoading, createWebhook, toggleWebhook, deleteWebhook };
}
