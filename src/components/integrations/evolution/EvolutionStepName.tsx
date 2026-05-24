import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Coins, AlertTriangle } from "lucide-react";
import { INBOX_COST } from "@/hooks/useEvolutionWhatsApp";

interface Props {
  instanceName: string;
  setInstanceName: (v: string) => void;
  tokenBalance: number | null;
  hasEnoughTokens: boolean;
  isLoading: boolean;
  onClose: () => void;
  onCreate: () => void;
}

export function EvolutionStepName({
  instanceName, setInstanceName, tokenBalance, hasEnoughTokens, isLoading, onClose, onCreate,
}: Props) {
  return (
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
          <p className="text-xs text-muted-foreground">Use apenas letras, números e underscores</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
        <Button onClick={onCreate} disabled={isLoading || !hasEnoughTokens} className="gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          <Coins className="h-4 w-4" />
          Criar Instância ({INBOX_COST} tokens)
        </Button>
      </DialogFooter>
    </>
  );
}
