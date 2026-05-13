import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Store,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Unplug,
  Loader2,
} from "lucide-react";
import { useNuvemshop } from "@/hooks/useNuvemshop";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

interface NuvemshopConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "manage" | "connect";
}

export function NuvemshopConnectionDialog({ open, onOpenChange, mode = "manage" }: NuvemshopConnectionDialogProps) {
  const {
    connection,
    integration,
    isLoading,
    isConnecting,
    isConnected,
    isDisconnecting,
    isSyncing,
    startOAuthFlow,
    disconnect,
    sync,
  } = useNuvemshop();

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const formatDate = (s: string | null | undefined) => {
    if (!s) return "—";
    try { return format(new Date(s), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return "—"; }
  };

  const showConnectScreen = mode === "connect" || !isConnected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10">
              <Store className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <DialogTitle>Nuvemshop</DialogTitle>
              <DialogDescription>
                Conecte sua loja Nuvemshop para sincronizar pedidos, produtos e clientes
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : showConnectScreen ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
              <p>Você será redirecionado para a Nuvemshop para autorizar a instalação do <strong>CRM Spy Pro</strong> na sua loja.</p>
              <p className="text-muted-foreground">Após autorizar, voltará automaticamente. Acesso somente leitura aos seus dados de venda + recebimento de webhooks em tempo real.</p>
            </div>
            <Button onClick={startOAuthFlow} disabled={isConnecting} className="w-full">
              {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Conectar Nuvemshop
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium">{connection?.store_name || `Loja #${connection?.store_id}`}</span>
              </div>
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">Conectada</Badge>
            </div>

            {connection?.store_url && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <ExternalLink className="h-3.5 w-3.5" />
                <a href={`https://${connection.store_url}`} target="_blank" rel="noreferrer" className="hover:underline">
                  {connection.store_url}
                </a>
              </div>
            )}

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Última sincronização:</span>
                <span>{formatDate(integration?.last_sync_at)}</span>
              </div>
              {integration?.error_message && (
                <div className="flex items-start gap-2 text-amber-600">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                  <span className="text-xs">{integration.error_message}</span>
                </div>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => sync("all")} disabled={isSyncing} className="w-full">
                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sincronizar agora
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDisconnect((v) => !v)}
                disabled={isDisconnecting}
                className="w-full text-red-600 hover:text-red-700"
              >
                <Unplug className="mr-2 h-4 w-4" />
                {confirmDisconnect ? "Cancelar" : "Desconectar"}
              </Button>
            </div>

            {confirmDisconnect && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-sm text-red-700">Tem certeza? Os dados sincronizados serão preservados, mas você perderá os webhooks em tempo real.</p>
                <Button variant="destructive" size="sm" onClick={() => disconnect()} disabled={isDisconnecting} className="w-full">
                  {isDisconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirmar desconexão
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
