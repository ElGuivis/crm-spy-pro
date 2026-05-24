import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WhatsAppIntegration } from "../types";

interface Props {
  campaignName: string;
  onNameChange: (v: string) => void;
  integrations: WhatsAppIntegration[];
  selectedIntegration: string;
  onIntegrationChange: (v: string) => void;
  delayMin: string;
  onDelayMinChange: (v: string) => void;
  delayMax: string;
  onDelayMaxChange: (v: string) => void;
}

export function CampaignBasicFields({
  campaignName, onNameChange, integrations, selectedIntegration, onIntegrationChange,
  delayMin, onDelayMinChange, delayMax, onDelayMaxChange,
}: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label>Nome da campanha</Label>
        <Input placeholder="Ex: Promoção de Natal" value={campaignName} onChange={(e) => onNameChange(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>WhatsApp para envio</Label>
        <Select value={selectedIntegration} onValueChange={onIntegrationChange}>
          <SelectTrigger><SelectValue placeholder="Selecione uma instância" /></SelectTrigger>
          <SelectContent>
            {integrations.map(i => (
              <SelectItem key={i.id} value={i.id}>
                {i.name} {i.metadata?.instanceName ? `(${i.metadata.instanceName})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Intervalo entre mensagens (segundos)</Label>
        <div className="flex items-center gap-2">
          <Input type="number" min="10" max="600" value={delayMin} onChange={(e) => onDelayMinChange(e.target.value)} className="w-24" />
          <span className="text-sm text-muted-foreground">a</span>
          <Input type="number" min="10" max="600" value={delayMax} onChange={(e) => onDelayMaxChange(e.target.value)} className="w-24" />
          <span className="text-sm text-muted-foreground">seg</span>
        </div>
        <p className="text-xs text-muted-foreground">Delay aleatório entre cada envio para simular comportamento humano (recomendado: 120-360s)</p>
      </div>
    </>
  );
}
