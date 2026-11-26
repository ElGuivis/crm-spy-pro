import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ReplyDelay } from "./replyDelay";

interface Props { value: ReplyDelay; onChange: (v: ReplyDelay) => void }

/** Espera antes da resposta automática (responder na hora denuncia robô). */
export function ReplyDelayFields({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <Label>Esperar antes de responder</Label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input
          type="number" min="0" max="120" className="w-20" aria-label="Espera mínima em segundos"
          value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })}
        />
        <span className="text-muted-foreground">a</span>
        <Input
          type="number" min="0" max="120" className="w-20" aria-label="Espera máxima em segundos"
          value={value.max} onChange={(e) => onChange({ ...value, max: e.target.value })}
        />
        <span className="text-muted-foreground">segundos</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Tempo sorteado a cada resposta: a mensagem da pessoa aparece como lida, depois "digitando..." e então sai a resposta. Máximo 120 s.
      </p>
    </div>
  );
}
