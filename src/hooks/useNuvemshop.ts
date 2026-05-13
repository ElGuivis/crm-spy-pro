import { useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const log = createLogger("useNuvemshop");

export interface NuvemshopConnection {
  id: string;
  store_id: number;
  store_name: string | null;
  store_url: string | null;
  status: "connected" | "disconnected";
  scope: string | null;
  created_at: string;
  updated_at: string;
}

export interface NuvemshopIntegration {
  id: string;
  name: string;
  status: string;
  last_sync_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

export function useNuvemshop() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  // Connection row
  const { data: connection, isLoading: connectionLoading, refetch: refetchConnection } = useQuery({
    queryKey: ["nuvemshop-connection", tenantId],
    queryFn: async (): Promise<NuvemshopConnection | null> => {
      if (!tenantId) return null;
      const { data } = await supabase
        .from("nuvemshop_connections" as never)
        .select("id, store_id, store_name, store_url, status, scope, created_at, updated_at")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return (data as unknown as NuvemshopConnection) || null;
    },
    enabled: !!tenantId,
  });

  // Integration row (display in /integrations list)
  const { data: integration, refetch: refetchIntegration } = useQuery({
    queryKey: ["nuvemshop-integration", tenantId],
    queryFn: async (): Promise<NuvemshopIntegration | null> => {
      if (!tenantId) return null;
      const { data } = await supabase
        .from("integrations")
        .select("id, name, status, last_sync_at, error_message, metadata")
        .eq("tenant_id", tenantId)
        .eq("type", "nuvemshop")
        .maybeSingle();
      return (data as unknown as NuvemshopIntegration) || null;
    },
    enabled: !!tenantId,
  });

  const startOAuthFlow = useCallback(async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("nuvemshop-oauth", {
        body: { action: "generate-oauth-url", origin_url: window.location.origin },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Falha ao gerar URL de autorização");
      window.location.href = data.url;
    } catch (e) {
      log.error("startOAuthFlow", e);
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error(`Falha ao conectar Nuvemshop: ${msg}`);
      setIsConnecting(false);
    }
  }, []);

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("nuvemshop-oauth", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nuvemshop desconectada");
      queryClient.invalidateQueries({ queryKey: ["nuvemshop-connection"] });
      queryClient.invalidateQueries({ queryKey: ["nuvemshop-integration"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error(`Falha ao desconectar: ${msg}`);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (syncType: "customers" | "products" | "orders" | "all" = "all") => {
      if (!integration?.id) throw new Error("Integração Nuvemshop não encontrada");
      const { data, error } = await supabase.functions.invoke("nuvemshop-sync", {
        body: { integrationId: integration.id, syncType },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Sincronização iniciada");
      queryClient.invalidateQueries({ queryKey: ["nuvemshop-integration"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error(`Falha ao sincronizar: ${msg}`);
    },
  });

  return {
    connection,
    integration,
    isLoading: connectionLoading,
    isConnecting,
    isConnected: connection?.status === "connected" && !!integration,
    isDisconnecting: disconnectMutation.isPending,
    isSyncing: syncMutation.isPending,
    startOAuthFlow,
    disconnect: disconnectMutation.mutateAsync,
    sync: syncMutation.mutateAsync,
    refetch: () => {
      refetchConnection();
      refetchIntegration();
    },
  };
}
