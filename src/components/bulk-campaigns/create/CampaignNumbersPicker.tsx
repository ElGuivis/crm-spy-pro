import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { WhatsAppIntegration } from "../types";

interface Props {
  integrations: WhatsAppIntegration[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

/** Escolha de um ou mais números para o disparo. Com vários, o envio reveza entre eles. */
export function CampaignNumbersPicker({ integrations, selected, onChange }: Props) {
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selected, id] : selected.filter((s) => s !== id));

  // número já escolhido que saiu da lista (apagado) continua visível para poder tirar
  const missing = selected.filter((id) => !integrations.some((i) => i.id === id));

  return (
    <div className="space-y-2">
      <Label>Números de WhatsApp para envio</Label>
      {integrations.length === 0 && missing.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum WhatsApp conectado. Conecte um em Canais.</p>
      ) : (
        <div className="space-y-1 rounded-md border p-2">
          {integrations.map((i) => {
            const connected = i.status === "connected";
            const checked = selected.includes(i.id);
            return (
              <label key={i.id} className="flex items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted/50 has-[:disabled]:opacity-60">
                <Checkbox
                  checked={checked}
                  disabled={!connected && !checked}
                  onCheckedChange={(v) => toggle(i.id, v === true)}
                />
                <span className="flex-1">
                  {i.name}
                  {i.metadata?.instanceName ? <span className="text-muted-foreground"> ({i.metadata.instanceName})</span> : null}
                </span>
                {!connected && <span className="text-xs text-orange-600">desconectado</span>}
              </label>
            );
          })}
          {missing.map((id) => (
            <label key={id} className="flex items-center gap-2 rounded px-1 py-1.5 text-sm">
              <Checkbox checked onCheckedChange={() => toggle(id, false)} />
              <span className="flex-1 text-muted-foreground">Número removido</span>
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {selected.length > 1
          ? `${selected.length} números: o envio reveza entre eles e a fila anda ${(1 + 0.5 * (selected.length - 1)).toLocaleString("pt-BR")}x mais rápido. Se um cair ou bater o limite do dia, segue pelos outros (e desacelera). O limite diário vale para cada número.`
          : "Escolha mais de um número para revezar o envio e dividir o volume entre os chips."}
      </p>
    </div>
  );
}
