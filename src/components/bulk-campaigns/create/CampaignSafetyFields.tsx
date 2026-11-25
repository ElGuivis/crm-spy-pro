import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, AlertTriangle } from "lucide-react";

const LINK_RE = /https?:\/\/|chat\.whatsapp\.com|wa\.me\//i;

interface Props {
  messageTemplate: string;
  replyMessage: string;
  onReplyChange: (v: string) => void;
  dailyLimit: string;
  onDailyLimitChange: (v: string) => void;
  dailyStep: string;
  onDailyStepChange: (v: string) => void;
}

/** Proteções contra restrição do número: resposta automática (link só para quem responde) e limite diário com aquecimento. */
export function CampaignSafetyFields({
  messageTemplate, replyMessage, onReplyChange, dailyLimit, onDailyLimitChange, dailyStep, onDailyStepChange,
}: Props) {
  const linkInFirst = LINK_RE.test(messageTemplate);

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Proteção do número
      </p>

      {linkInFirst ? (
        <p className="flex items-start gap-1.5 rounded-md bg-orange-500/10 p-2 text-xs text-orange-700 dark:text-orange-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A mensagem tem link. Link (principalmente de grupo) para quem não salvou o número é o que mais leva à restrição.
          Tire o link da mensagem, pergunte se a pessoa quer receber, e coloque o link na resposta automática abaixo.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="bulk-reply">Resposta automática para quem responder</Label>
        <Textarea
          id="bulk-reply"
          rows={3}
          value={replyMessage}
          onChange={(e) => onReplyChange(e.target.value)}
          placeholder={"Boa, {primeiro_nome}! Aqui está o link do grupo: https://chat.whatsapp.com/..."}
        />
        <p className="text-xs text-muted-foreground">
          Sai uma vez só, quando a pessoa responder ao disparo (até 7 dias). Quem responder "não" não recebe; "SAIR" descadastra.
          Vazio = sem resposta automática.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Limite por dia neste número</Label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input
            type="number" min="1" max="1000" className="w-24" aria-label="Envios no primeiro dia"
            value={dailyLimit} onChange={(e) => onDailyLimitChange(e.target.value)} placeholder="sem limite"
          />
          <span className="text-muted-foreground">no 1º dia, subindo</span>
          <Input
            type="number" min="0" max="500" className="w-20" aria-label="Aumento por dia"
            value={dailyStep} onChange={(e) => onDailyStepChange(e.target.value)}
          />
          <span className="text-muted-foreground">por dia</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Conta todos os disparos do mesmo número no dia. Ao atingir, continua sozinho no dia seguinte.
          Número novo ou que já foi restrito: comece com 20 a 40. Vazio = sem limite.
        </p>
      </div>
    </div>
  );
}
