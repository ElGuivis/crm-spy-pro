import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from "@/lib/logger";
import {
  sanitizeInstanceName, normalizeQrValue, generateQrImageFromCode,
} from "@/components/integrations/evolution/evolutionWhatsAppHelpers";

const log = createLogger("useEvolutionWhatsApp");

export type EvolutionStep = "name" | "qrcode" | "connected";

export interface ReconnectIntegration {
  id: string;
  name: string;
  metadata?: { instanceName?: string } | unknown;
}

interface Options {
  open: boolean;
  reconnectIntegration?: ReconnectIntegration | null;
  onSuccess: () => void;
  onOpenChange: (open: boolean) => void;
}

export const INBOX_COST = 100;
const MAX_QR_ATTEMPTS = 15;

export function useEvolutionWhatsApp({ open, reconnectIntegration, onSuccess, onOpenChange }: Options) {
  const { tenantId } = useAuth();
  const [step, setStep] = useState<EvolutionStep>("name");
  const [instanceName, setInstanceName] = useState("");
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecreating, setIsRecreating] = useState(false);
  const [needsRecreate, setNeedsRecreate] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [qrAttempts, setQrAttempts] = useState(0);
  const statusCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isReconnectMode = !!reconnectIntegration;
  const hasEnoughTokens = tokenBalance !== null && tokenBalance >= INBOX_COST;

  // Reconnect flow
  useEffect(() => {
    if (!open || !reconnectIntegration) return;
    const metadata = reconnectIntegration.metadata as { instanceName?: string } | undefined;
    const existingInstanceName = metadata?.instanceName || reconnectIntegration.name;
    setInstanceName(existingInstanceName);
    setIntegrationId(reconnectIntegration.id);
    setStep("qrcode");
    setNeedsRecreate(false);
    setQrAttempts(0);

    const reconnectFlow = async () => {
      try {
        log.info("Logging out instance before reconnect:", existingInstanceName);
        await supabase.functions.invoke("evolution-api", {
          body: { action: "logout", instanceName: existingInstanceName, integrationId: reconnectIntegration.id },
        });
        await new Promise(resolve => setTimeout(resolve, 1500));
        await refreshQrCode(existingInstanceName);
        startStatusCheck(existingInstanceName, reconnectIntegration.id);
      } catch (error) {
        log.error("Error in reconnect flow:", error);
        toast.error("Erro ao preparar reconexão");
      }
    };
    reconnectFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reconnectIntegration]);

  // Token balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!tenantId || !open || isReconnectMode) return;
      const { data, error } = await supabase
        .from("tenant_tokens").select("balance").eq("tenant_id", tenantId).single();
      if (!error && data) setTokenBalance(data.balance);
    };
    fetchBalance();
  }, [tenantId, open, isReconnectMode]);

  // Cleanup on close
  useEffect(() => {
    if (open) return;
    if (statusCheckIntervalRef.current) { clearInterval(statusCheckIntervalRef.current); statusCheckIntervalRef.current = null; }
    if (qrRetryTimeoutRef.current) { clearTimeout(qrRetryTimeoutRef.current); qrRetryTimeoutRef.current = null; }
    setTimeout(() => {
      setStep("name"); setInstanceName(""); setIntegrationId(null);
      setQrCode(null); setPairingCode(null); setNeedsRecreate(false); setQrAttempts(0);
    }, 200);
  }, [open]);

  const refreshQrCode = async (name?: string, attempt = 0) => {
    const targetName = name || sanitizeInstanceName(instanceName);
    if (attempt === 0) { setIsLoading(true); setNeedsRecreate(false); }
    setQrAttempts(attempt);

    try {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "connect", instanceName: targetName },
      });
      if (error) throw error;

      if (data?.isConnected) {
        setStep("connected");
        toast.success("WhatsApp já está conectado!");
        setIsLoading(false);
        return;
      }

      const qr = normalizeQrValue(data?.qrcode);
      if (qr) {
        setQrCode(qr);
        if (typeof data?.pairingCode === "string" && data.pairingCode) setPairingCode(data.pairingCode);
        setIsLoading(false);
        return;
      }

      if (typeof data?.code === "string" && data.code) {
        setQrCode(await generateQrImageFromCode(data.code));
        if (typeof data?.pairingCode === "string" && data.pairingCode) setPairingCode(data.pairingCode);
        setIsLoading(false);
        return;
      }

      if (data?.needsRecreate || attempt >= MAX_QR_ATTEMPTS) {
        log.info("QR code generation failed after max attempts, offering recreate");
        setNeedsRecreate(true);
        setIsLoading(false);
        return;
      }

      if (qrRetryTimeoutRef.current) clearTimeout(qrRetryTimeoutRef.current);
      qrRetryTimeoutRef.current = setTimeout(() => { refreshQrCode(targetName, attempt + 1); }, 2000);
    } catch (error) {
      log.error("Error getting QR code:", error);
      setIsLoading(false);
      if (attempt >= 3) {
        setNeedsRecreate(true);
        toast.error("Não foi possível gerar o QR Code. Tente recriar a instância.");
      } else {
        toast.error("Erro ao gerar QR Code");
      }
    }
  };

  const handleCreateInstance = async () => {
    if (!instanceName.trim()) { toast.error("Digite um nome para a instância"); return; }
    if (!hasEnoughTokens) {
      toast.error(`Tokens insuficientes. Criar uma caixa de entrada custa ${INBOX_COST} tokens.`);
      return;
    }

    const cleanName = sanitizeInstanceName(instanceName);
    setIsLoading(true); setNeedsRecreate(false); setQrAttempts(0);

    try {
      toast.info("Criando instância WhatsApp...");
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "create", instanceName: cleanName, tenantId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao criar instância");

      setIntegrationId(data.integration?.id);

      const createdQr = normalizeQrValue(data.qrcode);
      if (createdQr) {
        setQrCode(createdQr);
        if (typeof data.pairingCode === "string" && data.pairingCode) setPairingCode(data.pairingCode);
      } else if (typeof data?.code === "string" && data.code) {
        setQrCode(await generateQrImageFromCode(data.code));
        if (typeof data.pairingCode === "string" && data.pairingCode) setPairingCode(data.pairingCode);
      } else {
        await refreshQrCode(cleanName);
      }

      setStep("qrcode");
      startStatusCheck(cleanName, data.integration?.id);
    } catch (error: unknown) {
      log.error("Error creating instance:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("INSTANCE_NAME_EXISTS") || msg.includes("already in use")) {
        toast.error("Este nome de instância já existe. Escolha outro nome.");
      } else if (msg.includes("INSUFFICIENT_TOKENS")) {
        toast.error(`Tokens insuficientes. Criar uma caixa de entrada custa ${INBOX_COST} tokens.`);
      } else {
        toast.error("Erro ao criar instância. Verifique as credenciais do Evolution API.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecreateInstance = async () => {
    if (!instanceName) return;
    setIsRecreating(true); setNeedsRecreate(false); setQrCode(null); setPairingCode(null);

    try {
      toast.info("Recriando instância...");
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "recreate", instanceName: sanitizeInstanceName(instanceName), integrationId, tenantId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao recriar instância");

      const qr = normalizeQrValue(data.qrcode);
      if (qr) {
        setQrCode(qr);
        if (typeof data.pairingCode === "string" && data.pairingCode) setPairingCode(data.pairingCode);
      } else if (typeof data?.code === "string" && data.code) {
        setQrCode(await generateQrImageFromCode(data.code));
        if (typeof data.pairingCode === "string" && data.pairingCode) setPairingCode(data.pairingCode);
      } else {
        setQrAttempts(0);
        await refreshQrCode(instanceName);
      }
      toast.success("Instância recriada! Escaneie o QR Code.");
    } catch (error) {
      log.error("Error recreating instance:", error);
      toast.error("Erro ao recriar instância");
      setNeedsRecreate(true);
    } finally {
      setIsRecreating(false);
    }
  };

  const checkConnectionStatus = async (name: string, integId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "status", instanceName: name, integrationId: integId },
      });
      if (error) throw error;
      if (!data?.isConnected) return;

      if (statusCheckIntervalRef.current) { clearInterval(statusCheckIntervalRef.current); statusCheckIntervalRef.current = null; }

      // Fallback: ensure whatsapp_channels record exists (edge fn also does this)
      try {
        const { data: existingCh } = await supabase.from("whatsapp_channels" as any)
          .select("id").eq("integration_id", integId).maybeSingle();
        if (!existingCh && tenantId) {
          await supabase.from("whatsapp_channels" as any).insert({
            tenant_id: tenantId, provider: "evolution", display_name: name,
            status: "connected", integration_id: integId,
          });
          log.info("whatsapp_channels record created from client");
        }
      } catch (chErr) {
        log.error("Error ensuring whatsapp_channels:", chErr);
      }

      setStep("connected");
      toast.success("WhatsApp conectado com sucesso!");
    } catch (error) {
      log.error("Error checking status:", error);
    }
  };

  const startStatusCheck = (name: string, integId: string) => {
    statusCheckIntervalRef.current = setInterval(() => { checkConnectionStatus(name, integId); }, 3000);
  };

  const handleClose = () => {
    if (statusCheckIntervalRef.current) { clearInterval(statusCheckIntervalRef.current); statusCheckIntervalRef.current = null; }
    onOpenChange(false);
    if (step === "connected") onSuccess();
  };

  const handleFinish = () => { onSuccess(); handleClose(); };

  return {
    step, instanceName, setInstanceName, qrCode, pairingCode,
    isLoading, isRecreating, needsRecreate, tokenBalance, qrAttempts,
    isReconnectMode, hasEnoughTokens,
    handleCreateInstance, handleRecreateInstance, refreshQrCode,
    handleClose, handleFinish,
  };
}
