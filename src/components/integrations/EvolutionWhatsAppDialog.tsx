import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MessageSquare, QrCode, CheckCircle, RefreshCw, Smartphone, Coins, AlertTriangle, RotateCcw } from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "@/contexts/AuthContext";

import { createLogger } from '@/lib/logger';
const log = createLogger('EvolutionWhatsAppDialog');

interface ReconnectIntegration {
  id: string;
  name: string;
  metadata?: {
    instanceName?: string;
  } | unknown;
}

interface EvolutionWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  reconnectIntegration?: ReconnectIntegration | null;
}

type Step = "name" | "qrcode" | "connected";

export function EvolutionWhatsAppDialog({ open, onOpenChange, onSuccess, reconnectIntegration }: EvolutionWhatsAppDialogProps) {
  const { tenantId } = useAuth();
  const [step, setStep] = useState<Step>("name");
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
  const INBOX_COST = 100;
  const hasEnoughTokens = tokenBalance !== null && tokenBalance >= INBOX_COST;
  const MAX_QR_ATTEMPTS = 15; // Reduced since server now auto-recreates

  // Handle reconnect mode
  useEffect(() => {
    if (open && reconnectIntegration) {
      const metadata = reconnectIntegration.metadata as { instanceName?: string } | undefined;
      const existingInstanceName = metadata?.instanceName || reconnectIntegration.name;
      setInstanceName(existingInstanceName);
      setIntegrationId(reconnectIntegration.id);
      setStep("qrcode");
      setNeedsRecreate(false);
      setQrAttempts(0);
      
      const reconnectFlow = async () => {
        try {
          log.info('Logging out instance before reconnect:', existingInstanceName);
          await supabase.functions.invoke('evolution-api', {
            body: { 
              action: 'logout',
              instanceName: existingInstanceName,
              integrationId: reconnectIntegration.id
            }
          });
          
          await new Promise(resolve => setTimeout(resolve, 1500));
          await refreshQrCode(existingInstanceName);
          startStatusCheck(existingInstanceName, reconnectIntegration.id);
        } catch (error) {
          log.error('Error in reconnect flow:', error);
          toast.error('Erro ao preparar reconexão');
        }
      };
      
      reconnectFlow();
    }
  }, [open, reconnectIntegration]);

  // Fetch token balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!tenantId || !open || isReconnectMode) return;
      
      const { data, error } = await supabase
        .from('tenant_tokens')
        .select('balance')
        .eq('tenant_id', tenantId)
        .single();
      
      if (!error && data) {
        setTokenBalance(data.balance);
      }
    };
    
    fetchBalance();
  }, [tenantId, open, isReconnectMode]);

  // Cleanup on dialog close
  useEffect(() => {
    if (!open) {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
        statusCheckIntervalRef.current = null;
      }
      if (qrRetryTimeoutRef.current) {
        clearTimeout(qrRetryTimeoutRef.current);
        qrRetryTimeoutRef.current = null;
      }
      setTimeout(() => {
        setStep("name");
        setInstanceName("");
        setIntegrationId(null);
        setQrCode(null);
        setPairingCode(null);
        setNeedsRecreate(false);
        setQrAttempts(0);
      }, 200);
    }
  }, [open]);

  const handleCreateInstance = async () => {
    if (!instanceName.trim()) {
      toast.error("Digite um nome para a instância");
      return;
    }

    if (!hasEnoughTokens) {
      toast.error(`Tokens insuficientes. Criar uma caixa de entrada custa ${INBOX_COST} tokens.`);
      return;
    }

    const cleanName = instanceName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    setIsLoading(true);
    setNeedsRecreate(false);
    setQrAttempts(0);

    try {
      toast.info("Criando instância WhatsApp...");

      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { 
          action: 'create',
          instanceName: cleanName,
          tenantId
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao criar instância');

      setIntegrationId(data.integration?.id);
      
      const createdQr = normalizeQrValue(data.qrcode);
      if (createdQr) {
        setQrCode(createdQr);
        if (typeof data.pairingCode === 'string' && data.pairingCode) {
          setPairingCode(data.pairingCode);
        }
      } else if (typeof data?.code === 'string' && data.code) {
        await generateQrImageFromCode(data.code);
        if (typeof data.pairingCode === 'string' && data.pairingCode) {
          setPairingCode(data.pairingCode);
        }
      } else {
        await refreshQrCode(cleanName);
      }
      
      setStep("qrcode");
      startStatusCheck(cleanName, data.integration?.id);

    } catch (error: unknown) {
      log.error("Error creating instance:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('INSTANCE_NAME_EXISTS') || errorMessage.includes('already in use')) {
        toast.error("Este nome de instância já existe. Escolha outro nome.");
      } else if (errorMessage.includes('INSUFFICIENT_TOKENS')) {
        toast.error(`Tokens insuficientes. Criar uma caixa de entrada custa ${INBOX_COST} tokens.`);
      } else {
        toast.error("Erro ao criar instância. Verifique as credenciais do Evolution API.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  function normalizeQrValue(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;

    if (typeof value === 'object') {
      const obj = value as any;
      const base64 = obj.base64;
      if (typeof base64 === 'string' && base64) return base64;

      const qrcode = obj.qrcode;
      if (qrcode && typeof qrcode === 'object') {
        const nested = qrcode as any;
        const nestedBase64 = nested.base64;
        if (typeof nestedBase64 === 'string' && nestedBase64) return nestedBase64;
      }
    }

    return null;
  }

  const generateQrImageFromCode = async (code: string) => {
    const dataUrl = await QRCode.toDataURL(code, { margin: 1, width: 256 });
    setQrCode(dataUrl);
  };

  const refreshQrCode = async (name?: string, attempt = 0) => {
    const targetName = name || instanceName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    if (attempt === 0) {
      setIsLoading(true);
      setNeedsRecreate(false);
    }
    
    setQrAttempts(attempt);

    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'connect',
          instanceName: targetName,
        },
      });

      if (error) throw error;

      // Check if already connected
      if (data?.isConnected) {
        setStep("connected");
        toast.success("WhatsApp já está conectado!");
        setIsLoading(false);
        return;
      }

      const qr = normalizeQrValue(data?.qrcode);
      if (qr) {
        setQrCode(qr);
        if (typeof data?.pairingCode === 'string' && data.pairingCode) {
          setPairingCode(data.pairingCode);
        }
        setIsLoading(false);
        return;
      }

      if (typeof data?.code === 'string' && data.code) {
        await generateQrImageFromCode(data.code);
        if (typeof data?.pairingCode === 'string' && data.pairingCode) {
          setPairingCode(data.pairingCode);
        }
        setIsLoading(false);
        return;
      }

      // QR not ready - check if we should offer recreate
      if (data?.needsRecreate || attempt >= MAX_QR_ATTEMPTS) {
        log.info('QR code generation failed after max attempts, offering recreate');
        setNeedsRecreate(true);
        setIsLoading(false);
        return;
      }

      // Retry
      if (qrRetryTimeoutRef.current) clearTimeout(qrRetryTimeoutRef.current);
      qrRetryTimeoutRef.current = setTimeout(() => {
        refreshQrCode(targetName, attempt + 1);
      }, 2000);

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

  const handleRecreateInstance = async () => {
    if (!instanceName) return;
    
    setIsRecreating(true);
    setNeedsRecreate(false);
    setQrCode(null);
    setPairingCode(null);

    try {
      toast.info("Recriando instância...");

      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'recreate',
          instanceName: instanceName.trim().replace(/[^a-zA-Z0-9_-]/g, '_'),
          integrationId,
          tenantId
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao recriar instância');

      // Try to get QR from recreate response
      const qr = normalizeQrValue(data.qrcode);
      if (qr) {
        setQrCode(qr);
        if (typeof data.pairingCode === 'string' && data.pairingCode) {
          setPairingCode(data.pairingCode);
        }
      } else if (typeof data?.code === 'string' && data.code) {
        await generateQrImageFromCode(data.code);
        if (typeof data.pairingCode === 'string' && data.pairingCode) {
          setPairingCode(data.pairingCode);
        }
      } else {
        // Poll for QR
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
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { 
          action: 'status',
          instanceName: name,
          integrationId: integId
        }
      });

      if (error) throw error;

      if (data?.isConnected) {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
          statusCheckIntervalRef.current = null;
        }

        // Ensure whatsapp_channels record exists (edge function handles upsert,
        // but also create from client as fallback)
        try {
          const { data: existingCh } = await supabase
            .from('whatsapp_channels' as any)
            .select('id')
            .eq('integration_id', integId)
            .maybeSingle();

          if (!existingCh && tenantId) {
            await supabase
              .from('whatsapp_channels' as any)
              .insert({
                tenant_id: tenantId,
                provider: 'evolution',
                display_name: name,
                status: 'connected',
                integration_id: integId,
              });
            log.info('whatsapp_channels record created from client');
          }
        } catch (chErr) {
          log.error('Error ensuring whatsapp_channels:', chErr);
        }

        setStep("connected");
        toast.success("WhatsApp conectado com sucesso!");
      }
    } catch (error) {
      log.error("Error checking status:", error);
    }
  };

  const startStatusCheck = (name: string, integId: string) => {
    statusCheckIntervalRef.current = setInterval(() => {
      checkConnectionStatus(name, integId);
    }, 3000);
  };

  const handleClose = () => {
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
      statusCheckIntervalRef.current = null;
    }
    onOpenChange(false);
    if (step === "connected") {
      onSuccess();
    }
  };

  const handleFinish = () => {
    onSuccess();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "name" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <MessageSquare className="h-5 w-5 text-green-500" />
                </div>
                Nova Instância WhatsApp
              </DialogTitle>
              <DialogDescription>
                Crie uma nova conexão do WhatsApp via Evolution API
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Alert className={hasEnoughTokens ? "border-primary/20 bg-primary/5" : "border-destructive/50 bg-destructive/5"}>
                <Coins className={`h-4 w-4 ${hasEnoughTokens ? 'text-primary' : 'text-destructive'}`} />
                <AlertDescription className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Custo:</span>
                    <Badge variant="outline" className="bg-background">{INBOX_COST} tokens</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Seu saldo:</span>
                    <Badge variant={hasEnoughTokens ? "secondary" : "destructive"}>
                      {tokenBalance !== null ? tokenBalance : '...'} tokens
                    </Badge>
                  </div>
                </AlertDescription>
              </Alert>

              {!hasEnoughTokens && tokenBalance !== null && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Tokens insuficientes. Adicione mais créditos para criar uma nova caixa de entrada.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-2">
                <Label htmlFor="instanceName">Nome da Instância</Label>
                <Input
                  id="instanceName"
                  placeholder="Ex: minha_loja_whatsapp"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  disabled={!hasEnoughTokens}
                />
                <p className="text-xs text-muted-foreground">
                  Use apenas letras, números e underscores
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreateInstance} 
                disabled={isLoading || !hasEnoughTokens} 
                className="gap-2"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <Coins className="h-4 w-4" />
                Criar Instância ({INBOX_COST} tokens)
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "qrcode" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <QrCode className="h-5 w-5 text-green-500" />
                </div>
                {isReconnectMode ? "Reconectar WhatsApp" : "Conectar WhatsApp"}
              </DialogTitle>
              <DialogDescription>
                {isReconnectMode 
                  ? `Escaneie o QR Code para reconectar a instância "${instanceName}"`
                  : "Escaneie o QR Code com seu WhatsApp para conectar"
                }
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              {/* Loading with progress */}
              {isLoading && !qrCode && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Gerando QR Code... {qrAttempts > 0 && `(tentativa ${qrAttempts + 1})`}
                  </p>
                  {qrAttempts > 5 && (
                    <p className="text-xs text-muted-foreground">
                      Isso está demorando mais que o normal. Aguarde...
                    </p>
                  )}
                </div>
              )}

              {/* Needs Recreate Alert */}
              {needsRecreate && !isLoading && (
                <Alert variant="destructive" className="w-full">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex flex-col gap-2">
                    <span>A instância está em um estado inconsistente e não conseguiu gerar o QR Code.</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRecreateInstance}
                      disabled={isRecreating}
                      className="self-start gap-2"
                    >
                      {isRecreating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      Recriar Instância
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Loading or Recreating - only when there's no QR yet */}
              {(isLoading || isRecreating) && !needsRecreate && !qrCode ? (
                <div className="flex h-64 w-64 flex-col items-center justify-center rounded-xl border border-border bg-muted gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {isRecreating ? "Recriando instância..." : `Gerando QR Code... (${qrAttempts})`}
                  </p>
                </div>
              ) : qrCode && typeof qrCode === 'string' && !needsRecreate ? (
                <div className="relative">
                  <img 
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code" 
                    className="h-64 w-64 rounded-xl border border-border"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 gap-1"
                    onClick={() => refreshQrCode()}
                    disabled={isLoading}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Atualizar
                  </Button>
                </div>
              ) : !needsRecreate ? (
                <div className="flex h-64 w-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 gap-2">
                  <QrCode className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">QR Code não disponível</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => refreshQrCode()}
                    disabled={isLoading}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Gerar QR Code
                  </Button>
                </div>
              ) : null}

              {pairingCode && !needsRecreate && (
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Código de pareamento:</span>
                  <span className="font-mono font-bold text-foreground">{pairingCode}</span>
                </div>
              )}

              {!needsRecreate && !isRecreating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aguardando conexão...
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "connected" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                WhatsApp Conectado!
              </DialogTitle>
              <DialogDescription>
                Sua instância "{instanceName}" está pronta para uso
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <p className="text-center text-muted-foreground">
                O WhatsApp foi conectado com sucesso. Você já pode receber e enviar mensagens.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleFinish} className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Concluir
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
