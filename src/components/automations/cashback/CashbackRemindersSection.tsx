import { Bell, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CashbackConfig, REMINDER_PLACEHOLDERS } from "./cashback-config-types";

interface CashbackRemindersSectionProps {
  config: CashbackConfig;
  setConfig: (config: CashbackConfig) => void;
}

export function CashbackRemindersSection({ config, setConfig }: CashbackRemindersSectionProps) {
  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h4 className="font-medium">Lembretes de Vencimento</h4>
        <span className="text-xs text-muted-foreground">(máximo 2)</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Configure lembretes automáticos para avisar o cliente antes do cupom expirar.
      </p>

      {/* Reminder 1 */}
      <ReminderBlock
        number={1}
        enabled={config.reminder1Enabled}
        onToggle={(checked) => setConfig({ ...config, reminder1Enabled: checked })}
        daysBefore={config.reminder1DaysBefore}
        maxDays={config.durationDays - 1}
        onDaysChange={(days) => setConfig({ ...config, reminder1DaysBefore: days })}
        message={config.reminder1Message}
        onMessageChange={(msg) => setConfig({ ...config, reminder1Message: msg })}
        onInsertPlaceholder={(key) => setConfig({ ...config, reminder1Message: config.reminder1Message + key })}
      />

      {/* Reminder 2 */}
      <ReminderBlock
        number={2}
        enabled={config.reminder2Enabled}
        onToggle={(checked) => setConfig({ ...config, reminder2Enabled: checked })}
        daysBefore={config.reminder2DaysBefore}
        maxDays={config.reminder1Enabled ? config.reminder1DaysBefore - 1 : config.durationDays - 1}
        onDaysChange={(days) => setConfig({ ...config, reminder2DaysBefore: days })}
        message={config.reminder2Message}
        onMessageChange={(msg) => setConfig({ ...config, reminder2Message: msg })}
        onInsertPlaceholder={(key) => setConfig({ ...config, reminder2Message: config.reminder2Message + key })}
      />
    </div>
  );
}

interface ReminderBlockProps {
  number: number;
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  daysBefore: number;
  maxDays: number;
  onDaysChange: (days: number) => void;
  message: string;
  onMessageChange: (message: string) => void;
  onInsertPlaceholder: (key: string) => void;
}

function ReminderBlock({
  number,
  enabled,
  onToggle,
  daysBefore,
  maxDays,
  onDaysChange,
  message,
  onMessageChange,
  onInsertPlaceholder,
}: ReminderBlockProps) {
  return (
    <div className="space-y-3 p-3 rounded-lg bg-background border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {number}
          </span>
          <span className="text-sm font-medium">
            {number === 1 ? 'Primeiro' : 'Segundo'} Lembrete
          </span>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>

      {enabled && (
        <div className="space-y-3 pl-8">
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Enviar</Label>
            <Input
              type="number"
              min={1}
              max={maxDays}
              value={daysBefore}
              onChange={(e) => onDaysChange(parseInt(e.target.value) || daysBefore)}
              className="w-20 h-8"
            />
            <span className="text-sm text-muted-foreground">dias antes de expirar</span>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Mensagem do lembrete</Label>
            <div className="flex flex-wrap gap-1 mb-1">
              {REMINDER_PLACEHOLDERS.map((placeholder) => (
                <Badge
                  key={placeholder.key}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors text-xs py-0"
                  onClick={() => onInsertPlaceholder(placeholder.key)}
                  title={placeholder.description}
                >
                  <Plus className="h-2.5 w-2.5 mr-0.5" />
                  {placeholder.label}
                </Badge>
              ))}
            </div>
            <Textarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder="Mensagem do lembrete..."
              className="min-h-[80px] text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
