import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

type Schedule = Record<string, { enabled: boolean; start: string; end: string }>;

interface Props {
  enabled: boolean;
  schedule: Schedule;
  onEnabledChange: (v: boolean) => void;
  onScheduleChange: (s: Schedule) => void;
}

const DAYS = [
  { key: "1", label: "Segunda" }, { key: "2", label: "Terça" }, { key: "3", label: "Quarta" },
  { key: "4", label: "Quinta" }, { key: "5", label: "Sexta" }, { key: "6", label: "Sábado" }, { key: "0", label: "Domingo" },
];

export function CampaignSendingWindow({ enabled, schedule, onEnabledChange, onScheduleChange }: Props) {
  const update = (key: string, patch: Partial<Schedule[string]>) => {
    onScheduleChange({ ...schedule, [key]: { ...schedule[key], ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Janela de horários de disparo
        </Label>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-muted-foreground">{enabled ? "Ativo" : "Inativo"}</span>
          <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
        </label>
      </div>
      {enabled && (
        <div className="space-y-2 p-3 border border-border/50 rounded-lg bg-muted/20">
          {DAYS.map(day => {
            const config = schedule[day.key];
            return (
              <div key={day.key} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-24 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => update(day.key, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className={cn("text-sm", config.enabled ? "text-foreground font-medium" : "text-muted-foreground line-through")}>
                    {day.label}
                  </span>
                </label>
                {config.enabled ? (
                  <div className="flex items-center gap-1.5">
                    <Input type="time" value={config.start} onChange={(e) => update(day.key, { start: e.target.value })} className="w-28 h-8 text-xs" />
                    <span className="text-xs text-muted-foreground">às</span>
                    <Input type="time" value={config.end} onChange={(e) => update(day.key, { end: e.target.value })} className="w-28 h-8 text-xs" />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Sem disparos</span>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground mt-1">Os disparos serão pausados automaticamente fora dos horários configurados e retomados no próximo horário disponível.</p>
        </div>
      )}
    </div>
  );
}
