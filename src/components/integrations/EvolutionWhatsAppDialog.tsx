import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useEvolutionWhatsApp, type ReconnectIntegration } from "@/hooks/useEvolutionWhatsApp";
import { EvolutionStepName } from "./evolution/EvolutionStepName";
import { EvolutionStepQRCode } from "./evolution/EvolutionStepQRCode";
import { EvolutionStepConnected } from "./evolution/EvolutionStepConnected";

interface EvolutionWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  reconnectIntegration?: ReconnectIntegration | null;
}

export function EvolutionWhatsAppDialog({ open, onOpenChange, onSuccess, reconnectIntegration }: EvolutionWhatsAppDialogProps) {
  const evo = useEvolutionWhatsApp({ open, onOpenChange, onSuccess, reconnectIntegration });

  return (
    <Dialog open={open} onOpenChange={evo.handleClose}>
      <DialogContent className="sm:max-w-md">
        {evo.step === "name" && (
          <EvolutionStepName
            instanceName={evo.instanceName}
            setInstanceName={evo.setInstanceName}
            tokenBalance={evo.tokenBalance}
            hasEnoughTokens={evo.hasEnoughTokens}
            isLoading={evo.isLoading}
            onClose={evo.handleClose}
            onCreate={evo.handleCreateInstance}
          />
        )}

        {evo.step === "qrcode" && (
          <EvolutionStepQRCode
            instanceName={evo.instanceName}
            isReconnectMode={evo.isReconnectMode}
            qrCode={evo.qrCode}
            pairingCode={evo.pairingCode}
            isLoading={evo.isLoading}
            isRecreating={evo.isRecreating}
            needsRecreate={evo.needsRecreate}
            qrAttempts={evo.qrAttempts}
            onRefreshQr={() => evo.refreshQrCode()}
            onRecreate={evo.handleRecreateInstance}
            onClose={evo.handleClose}
          />
        )}

        {evo.step === "connected" && (
          <EvolutionStepConnected
            instanceName={evo.instanceName}
            onFinish={evo.handleFinish}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
