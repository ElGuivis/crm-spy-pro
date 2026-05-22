import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from "@/lib/logger";
import { MelhorEnvioStatus } from "./melhor-envio-types";

const logger = createLogger("MelhorEnvio");
function getErrMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

// Re-exports for consumers that import from this file
export { useMelhorEnvioSync } from "./useMelhorEnvioSync";
export { useMelhorEnvioShipments } from "./useMelhorEnvioShipments";
export type { MelhorEnvioShipment, ShipmentFilters, GlobalShipmentStats } from "./melhor-envio-types";
export type { MelhorEnvioStatus };

export function useMelhorEnvio() {
  const [status, setStatus] = useState<MelhorEnvioStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const { toast } = useToast();
  const { loading: authLoading } = useAuth();

  const fetchStatus = useCallback(async () => {
    try {
      logger.debug("Fetching status");
      const { data: result, error: invokeError } = await supabase.functions.invoke("melhor-envio", { body: { action: "status" } });
      if (invokeError) { logger.error("Error fetching status", invokeError); return; }
      if (result?.success) {
        setStatus({ connected: result.connected, expired: result.expired || false, user: result.user || null, expires_at: result.expires_at || null });
      }
    } catch (error) { logger.error("Error fetching status", error); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams(window.location.search);
    const cbStatus = params.get("status");
    const reason = params.get("reason");
    const melhorEnvio = params.get("melhor_envio");
    if (cbStatus === "ok" && melhorEnvio === "connected") {
      logger.info("Connection successful");
      toast({ title: "Sucesso", description: "Melhor Envio conectado com sucesso!" });
      window.history.replaceState({}, document.title, "/integrations");
    } else if (cbStatus === "error") {
      logger.error("Callback error", { reason });
      toast({ title: "Erro", description: reason ? decodeURIComponent(reason) : "Falha ao conectar com Melhor Envio", variant: "destructive" });
      window.history.replaceState({}, document.title, "/integrations");
    }
    fetchStatus();
  }, [authLoading, fetchStatus, toast]);

  const startOAuthFlow = useCallback(async () => {
    setIsConnecting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("melhor-envio", { body: { action: "authorize", frontend_url: window.location.origin } });
      if (error) throw new Error(getErrMsg(error) || "Falha ao iniciar autenticação");
      if (result?.success && result.auth_url) { logger.info("Redirecting to OAuth"); window.location.href = result.auth_url; return; }
      throw new Error(result?.error || "Falha ao iniciar autenticação");
    } catch (error: unknown) {
      logger.error("OAuth error", error);
      toast({ title: "Erro", description: getErrMsg(error) || "Falha ao conectar com Melhor Envio", variant: "destructive" });
      setIsConnecting(false);
    }
  }, [toast]);

  const handleCallback = useCallback(async (_code: string) => {
    logger.debug("handleCallback called - processed by backend");
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const { data: result, error } = await supabase.functions.invoke("melhor-envio", { body: { action: "disconnect" } });
      if (error) throw new Error(getErrMsg(error) || "Falha ao desconectar");
      if (result?.success) {
        toast({ title: "Desconectado", description: "Melhor Envio desconectado com sucesso" });
        setStatus({ connected: false, expired: false, user: null, expires_at: null });
      }
    } catch (error: unknown) {
      toast({ title: "Erro", description: getErrMsg(error) || "Falha ao desconectar", variant: "destructive" });
    }
  }, [toast]);

  const syncShipments = useCallback(async () => {
    setIsSyncing(true);
    setSyncProgress("Buscando envios...");
    try {
      const { data, error } = await supabase.functions.invoke("melhor-envio", { body: { action: "sync_shipments" } });
      if (error) throw new Error(getErrMsg(error) || "Falha ao sincronizar");
      if (data?.success) {
        const totalValue = data.total_value ? ` (R$ ${data.total_value.toFixed(2)} em fretes)` : "";
        toast({ title: "Sincronização concluída", description: `${data.synced} envios sincronizados${totalValue}` });
        return { success: true, synced: data.synced, total_value: data.total_value };
      }
      throw new Error(data?.error || "Falha ao sincronizar");
    } catch (error: unknown) {
      toast({ title: "Erro", description: getErrMsg(error) || "Falha ao sincronizar envios", variant: "destructive" });
      return { success: false, error: getErrMsg(error) };
    } finally { setIsSyncing(false); setSyncProgress(null); }
  }, [toast]);

  const syncTracking = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("melhor-envio", { body: { action: "sync_tracking" } });
      if (error) throw new Error(getErrMsg(error) || "Falha ao atualizar rastreio");
      if (data?.success) { toast({ title: "Rastreio atualizado", description: `${data.updated} envios atualizados` }); return { success: true, updated: data.updated }; }
      throw new Error(data?.error || "Falha ao atualizar rastreio");
    } catch (error: unknown) {
      toast({ title: "Erro", description: getErrMsg(error) || "Falha ao atualizar rastreio", variant: "destructive" });
      return { success: false, error: getErrMsg(error) };
    }
  }, [toast]);

  const syncSingleShipment = useCallback(async (shipmentId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("melhor-envio", { body: { action: "sync_single", shipment_id: shipmentId } });
      if (error) throw new Error(getErrMsg(error) || "Falha ao atualizar rastreio");
      if (data?.success) { toast({ title: "Rastreio atualizado", description: "Informações do envio atualizadas" }); return { success: true, status: data.status }; }
      throw new Error(data?.error || "Falha ao atualizar rastreio");
    } catch (error: unknown) {
      toast({ title: "Erro", description: getErrMsg(error) || "Falha ao atualizar rastreio", variant: "destructive" });
      return { success: false, error: getErrMsg(error) };
    }
  }, [toast]);

  return { status, isLoading, isConnecting, isSyncing, syncProgress, startOAuthFlow, handleCallback, disconnect, syncShipments, syncTracking, syncSingleShipment, refetch: fetchStatus };
}
