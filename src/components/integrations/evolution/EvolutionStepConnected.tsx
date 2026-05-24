import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

interface Props {
  instanceName: string;
  onFinish: () => void;
}

export function EvolutionStepConnected({ instanceName, onFinish }: Props) {
  return (
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
        <Button onClick={onFinish} className="gap-2">
          <CheckCircle className="h-4 w-4" />
          Concluir
        </Button>
      </DialogFooter>
    </>
  );
}
