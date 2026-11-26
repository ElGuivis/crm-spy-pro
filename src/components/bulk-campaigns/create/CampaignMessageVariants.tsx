import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

const MAX_VARIANTS = 9;

interface Props {
  variants: string[];
  onChange: (v: string[]) => void;
}

/** Textos alternativos completos: cada contato recebe um sorteado entre a mensagem principal e estes. */
export function CampaignMessageVariants({ variants, onChange }: Props) {
  const update = (i: number, text: string) => onChange(variants.map((v, j) => (j === i ? text : v)));
  const remove = (i: number) => onChange(variants.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Variações da mensagem {variants.length > 0 && <span className="text-muted-foreground">({variants.length + 1} textos)</span>}</Label>
        <Button
          type="button" size="sm" variant="outline" className="h-7 gap-1"
          disabled={variants.length >= MAX_VARIANTS}
          onClick={() => onChange([...variants, ""])}
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar variação
        </Button>
      </div>
      {variants.map((text, i) => (
        <div key={i} className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => update(i, e.target.value)}
            rows={4}
            placeholder={`Variação ${i + 2}: outro jeito de dizer a mesma coisa. Aceita {primeiro_nome} e {Oi|Olá}.`}
            aria-label={`Variação ${i + 2}`}
          />
          <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} aria-label={`Remover variação ${i + 2}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        {variants.length > 0
          ? "Cada contato recebe um dos textos, sorteado. Variações em branco são ignoradas."
          : "Escreva outros textos para a mesma mensagem: cada contato recebe um deles. Texto igual para todos pesa contra o número."}
      </p>
    </div>
  );
}
