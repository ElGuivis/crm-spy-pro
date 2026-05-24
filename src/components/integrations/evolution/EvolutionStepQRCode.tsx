import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, QrCode, RefreshCw, Smartphone, AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  instanceName: string;
  isReconnectMode: boolean;
  qrCode: string | null;
  pairingCode: string | null;
  isLoading: boolean;
  isRecreating: boolean;
  needsRecreate: boolean;
  qrAttempts: number;
  onRefreshQr: () => void;
  onRecreate: () => void;
  onClose: () => void;
}

export function EvolutionStepQRCode({
  instanceName, isReconnectMode, qrCode, pairingCode,
  isLoading, isRecreating, needsRecreate, qrAttempts,
  onRefreshQr, onRecreate, onClose,
}: Props) {
  return (
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
            : "Escaneie o QR Code com seu WhatsApp para conectar"}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4 py-6">
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

        {needsRecreate && !isLoading && (
          <Alert variant="destructive" className="w-full">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex flex-col gap-2">
              <span>A instância está em um estado inconsistente e não conseguiu gerar o QR Code.</span>
              <Button variant="outline" size="sm" onClick={onRecreate} disabled={isRecreating} className="self-start gap-2">
                {isRecreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Recriar Instância
              </Button>
            </AlertDescription>
          </Alert>
        )}

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
              variant="outline" size="sm"
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 gap-1"
              onClick={onRefreshQr} disabled={isLoading}
            >
              <RefreshCw className="h-3 w-3" />
              Atualizar
            </Button>
          </div>
        ) : !needsRecreate ? (
          <div className="flex h-64 w-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 gap-2">
            <QrCode className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">QR Code não disponível</p>
            <Button variant="outline" size="sm" className="gap-1" onClick={onRefreshQr} disabled={isLoading}>
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
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
      </DialogFooter>
    </>
  );
}
