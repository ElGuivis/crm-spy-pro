import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  scheduledDate: string;
  scheduledTime: string;
  timezone: string;
  onScheduledDateChange: (v: string) => void;
  onScheduledTimeChange: (v: string) => void;
  onTimezoneChange: (v: string) => void;
}

export function CampaignScheduling({
  scheduledDate, scheduledTime, timezone,
  onScheduledDateChange, onScheduledTimeChange, onTimezoneChange,
}: Props) {
  return (
    <div className="space-y-2">
      <Label>Agendamento (opcional)</Label>
      <div className="flex items-center gap-2">
        <Input type="date" value={scheduledDate} onChange={(e) => onScheduledDateChange(e.target.value)} className="w-40" />
        <Input type="time" value={scheduledTime} onChange={(e) => onScheduledTimeChange(e.target.value)} className="w-32" />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Fuso horário:</Label>
        <Select value={timezone} onValueChange={onTimezoneChange}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="America/Sao_Paulo">Brasília (GMT-3)</SelectItem>
            <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
            <SelectItem value="America/Cuiaba">Cuiabá (GMT-4)</SelectItem>
            <SelectItem value="America/Belem">Belém (GMT-3)</SelectItem>
            <SelectItem value="America/Fortaleza">Fortaleza (GMT-3)</SelectItem>
            <SelectItem value="America/Recife">Recife (GMT-3)</SelectItem>
            <SelectItem value="America/Bahia">Bahia (GMT-3)</SelectItem>
            <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
            <SelectItem value="America/Noronha">Fernando de Noronha (GMT-2)</SelectItem>
            <SelectItem value="America/Porto_Velho">Porto Velho (GMT-4)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        {scheduledDate && scheduledTime ? "A campanha será iniciada automaticamente no horário agendado" : "Deixe vazio para iniciar manualmente"}
      </p>
    </div>
  );
}
