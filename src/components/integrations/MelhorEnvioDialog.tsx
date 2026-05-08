import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Truck, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  User,
  Calendar,
  Package,
  Unplug
} from 'lucide-react';
import { useMelhorEnvio } from '@/hooks/useMelhorEnvio';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

interface MelhorEnvioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: 'manage' | 'connect';
}

export function MelhorEnvioDialog({ open, onOpenChange, mode = 'manage' }: MelhorEnvioDialogProps) {
  const { 
    status, 
    isLoading, 
    isConnecting, 
    isSyncing,
    startOAuthFlow, 
    disconnect, 
    syncShipments,
    syncTracking,
    refetch 
  } = useMelhorEnvio();

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConnect = () => {
    startOAuthFlow();
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    await disconnect();
    setIsDisconnecting(false);
  };

  const handleSync = async () => {
    await syncShipments();
  };

  const handleSyncTracking = async () => {
    await syncTracking();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return '-';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Truck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle>Melhor Envio</DialogTitle>
              <DialogDescription>
                Gestão de fretes e rastreamento de envios
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : status?.connected && mode === 'manage' ? (
          <div className="space-y-4 py-4">
            {/* Status da conexão */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                {status.expired ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">Token expirado</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Conectado</span>
                  </>
                )}
              </div>
              <Badge variant={status.expired ? "outline" : "secondary"}>
                {status.expired ? "Reconectar" : "Ativo"}
              </Badge>
            </div>

            {/* Informações do usuário */}
            {status.user && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{status.user.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="ml-6">{status.user.email}</span>
                </div>
              </div>
            )}

            {/* Data de expiração */}
            {status.expires_at && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Expira em: {formatDate(status.expires_at)}</span>
              </div>
            )}

            <Separator />

            {/* Ações */}
            <div className="space-y-2">
              <Button 
                onClick={handleSync} 
                disabled={isSyncing || status.expired}
                className="w-full"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Sincronizando...' : 'Sincronizar Envios'}
              </Button>

              <Button 
                onClick={handleSyncTracking} 
                variant="outline"
                disabled={isSyncing || status.expired}
                className="w-full"
              >
                <Package className="h-4 w-4 mr-2" />
                Atualizar Rastreamento
              </Button>

              <Button 
                onClick={() => {
                  onOpenChange(false);
                  window.location.href = '/envios';
                }}
                variant="outline"
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Ver Envios
              </Button>

              <Separator />

              <Button 
                onClick={handleDisconnect} 
                variant="destructive"
                disabled={isDisconnecting}
                className="w-full"
              >
                <Unplug className="h-4 w-4 mr-2" />
                {isDisconnecting ? 'Desconectando...' : 'Desconectar'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Descrição */}
            <p className="text-sm text-muted-foreground">
              Conecte sua conta do Melhor Envio para gerenciar seus fretes e rastrear entregas diretamente no sistema.
            </p>

            {/* Features */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Sincronização automática de envios</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Rastreamento em tempo real</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Histórico de entregas</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Múltiplas transportadoras</span>
              </div>
            </div>

            <Separator />

            {/* Botão de conectar */}
            <Button 
              onClick={handleConnect} 
              disabled={isConnecting}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Conectar com Melhor Envio
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Você será redirecionado para o Melhor Envio para autorizar a conexão.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
