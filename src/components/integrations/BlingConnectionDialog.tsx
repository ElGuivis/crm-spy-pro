import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Store, CheckCircle, RefreshCw, XCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { createLogger } from '@/lib/logger';
const log = createLogger('BlingConnectionDialog');

interface BlingConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  mode?: 'manage' | 'connect';
}

type Step = 'initial' | 'connecting' | 'success' | 'error';

interface BlingConnection {
  id: string;
  status: string;
  scopes: string[] | null;
  token_expires_at: string;
  refresh_expires_at: string | null;
  created_at: string;
  updated_at: string;
  token_expired: boolean;
  token_expires_soon: boolean;
}

export function BlingConnectionDialog({ 
  open, 
  onOpenChange, 
  onSuccess,
  mode = 'manage' 
}: BlingConnectionDialogProps) {
  const { tenantId, user } = useAuth();
  const [step, setStep] = useState<Step>('initial');
  const [isLoading, setIsLoading] = useState(false);
  const [connection, setConnection] = useState<BlingConnection | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Fetch connection status when dialog opens
  useEffect(() => {
    if (open && tenantId) {
      fetchConnection();
    }
  }, [open, tenantId]);

  // Reset state when dialog closes or mode changes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('initial');
        setErrorMessage('');
      }, 200);
    }
  }, [open]);

  const fetchConnection = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("bling-oauth", {
        body: {
          action: "get_connection",
          tenant_id: tenantId,
        },
      });

      if (error) throw error;

      setConnection(data?.connection || null);
    } catch (error) {
      log.error("Error fetching Bling connection:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!tenantId || !user?.id) {
      toast.error("Erro de autenticação");
      return;
    }

    setStep('connecting');

    try {
      const { data, error } = await supabase.functions.invoke("bling-oauth", {
        body: {
          action: "get_auth_url",
          tenant_id: tenantId,
          user_id: user.id,
          frontend_url: window.location.origin,
        },
      });

      if (error) throw error;

      if (data?.auth_url) {
        // Redirect to Bling OAuth
        window.location.href = data.auth_url;
      } else {
        throw new Error("URL de autenticação não retornada");
      }
    } catch (error: any) {
      log.error("Error starting OAuth:", error);
      setStep('error');
      setErrorMessage(error.message || "Erro ao iniciar conexão");
    }
  };

  const handleRefreshToken = async () => {
    if (!tenantId) return;

    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("bling-oauth", {
        body: {
          action: "refresh",
          tenant_id: tenantId,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success("Token renovado com sucesso!");
      await fetchConnection();
    } catch (error: any) {
      log.error("Error refreshing token:", error);
      toast.error(error.message || "Erro ao renovar token");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!tenantId) return;

    setIsDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bling-oauth", {
        body: {
          action: "disconnect",
          tenant_id: tenantId,
        },
      });

      if (error) throw error;

      toast.success("Bling desconectado com sucesso");
      setConnection(null);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      log.error("Error disconnecting:", error);
      toast.error(error.message || "Erro ao desconectar");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const renderContent = () => {
    // Show loading state
    if (isLoading) {
      return (
        <div className="space-y-4 py-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }

    // Show management view if connected and in manage mode
    if (connection?.status === 'connected' && mode === 'manage') {
      return (
        <div className="space-y-4 py-4">
          {/* Status */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium">Conectado</span>
            </div>
            <Badge variant="secondary" className="bg-green-500/10 text-green-600">
              Ativo
            </Badge>
          </div>

          {/* Token status */}
          {connection.token_expired ? (
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Token expirado</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Clique em "Renovar Token" para continuar usando a integração.
              </p>
            </div>
          ) : connection.token_expires_soon ? (
            <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <div className="flex items-center gap-2 text-yellow-600">
                <RefreshCw className="h-4 w-4" />
                <span className="text-sm font-medium">Token expira em breve</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Renove o token para evitar interrupções.
              </p>
            </div>
          ) : null}

          {/* Info */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token expira em:</span>
              <span>{formatDate(connection.token_expires_at)}</span>
            </div>
            {connection.refresh_expires_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Refresh expira em:</span>
                <span>{formatDate(connection.refresh_expires_at)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Conectado em:</span>
              <span>{formatDate(connection.created_at)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleRefreshToken}
              disabled={isRefreshing}
              className="w-full"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Renovar Token
            </Button>

            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="w-full"
            >
              {isDisconnecting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Desconectar
            </Button>
          </div>
        </div>
      );
    }

    // Show connect flow
    if (step === 'connecting') {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Redirecionando para o Bling...</p>
        </div>
      );
    }

    if (step === 'error') {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="font-medium text-foreground mb-2">Erro na conexão</h3>
          <p className="text-sm text-muted-foreground text-center mb-6">{errorMessage}</p>
          <Button onClick={() => setStep('initial')}>Tentar novamente</Button>
        </div>
      );
    }

    // Initial state - show connect button
    return (
      <div className="space-y-6 py-4">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <Store className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-medium text-sm">Gestão de Pedidos</h4>
              <p className="text-xs text-muted-foreground">
                Sincronize pedidos, produtos e clientes do Bling
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <RefreshCw className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-medium text-sm">Sincronização Automática</h4>
              <p className="text-xs text-muted-foreground">
                Mantenha seus dados sempre atualizados
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleConnect} className="w-full" size="lg">
          <ExternalLink className="h-4 w-4 mr-2" />
          Conectar com Bling
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Você será redirecionado para o Bling para autorizar a conexão
        </p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Store className="h-4 w-4 text-blue-500" />
            </div>
            Bling ERP
          </DialogTitle>
          <DialogDescription>
            {connection?.status === 'connected' && mode === 'manage'
              ? "Gerencie sua conexão com o Bling"
              : "Conecte sua conta Bling para sincronizar dados"
            }
          </DialogDescription>
        </DialogHeader>

        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
