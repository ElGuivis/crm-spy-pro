import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampaignNumbersPicker } from "./CampaignNumbersPicker";
import type { WhatsAppIntegration } from "../types";

interface Props {
  campaignName: string;
  onNameChange: (v: string) => void;
  integrations: WhatsAppIntegration[];
  selectedIntegrations: string[];
  onIntegrationsChange: (v: string[]) => void;
  delayMin: string;
  onDelayMinChange: (v: string) => void;
  delayMax: string;
  onDelayMaxChange: (v: string) => void;
}

export function CampaignBasicFields({
  campaignName, onNameChange, integrations, selectedIntegrations, onIntegrationsChange,
  delayMin, onDelayMinChange, delayMax, onDelayMaxChange,
}: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label>Nome da campanha</Label>
        <Input placeholder="Ex: Promoção de Natal" value={campaignName} onChange={(e) => onNameChange(e.target.value)} />
      </div>

      <CampaignNumbersPicker integrations={integrations} selected={selectedIntegrations} onChange={onIntegrationsChange} />

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
