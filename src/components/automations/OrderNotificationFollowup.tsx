import { BellRing } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DELAY_UNIT_LABELS, DEFAULT_FOLLOWUP, type DelayUnit, type StatusRule } from "@/lib/orderNotification";

interface Props {
  rule: StatusRule;
  updateRule: (statusName: string, patch: Partial<StatusRule>) => void;
  updateFollowupDelay: (statusName: string, value: number, unit: DelayUnit) => void;
}

/** Lembrete: segundo aviso se o pedido continuar no mesmo status depois de um tempo (ex.: PIX que não foi pago). */
export function OrderNotificationFollowup({ rule, updateRule, updateFollowupDelay }: Props) {
  const on = !!rule.followup_enabled;
  const unit = rule.followup_delay_unit || "hours";
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Enviar um lembrete</p>
            <p className="text-xs text-muted-foreground">Segundo aviso se o pedido continuar em “{rule.status_name}”.</p>
          </div>
        </div>
        <Switch
          checked={on} aria-label="Enviar um lembrete"
          onCheckedChange={(v) => updateRule(rule.status_name, v
            ? { followup_enabled: true, followup_template: rule.followup_template || DEFAULT_FOLLOWUP, followup_delay_value: rule.followup_delay_value || 2, followup_delay_unit: unit, followup_delay_minutes: (rule.followup_delay_minutes || 0) > 0 ? rule.followup_delay_minutes : 120 }
            : { followup_enabled: false })}
        />
      </div>
      {on && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="whitespace-nowrap text-sm">Enviar depois de</Label>
            <Input
              type="number" min={1} className="w-20" aria-label="Tempo até o lembrete"
              value={rule.followup_delay_value ?? 2}
              onChange={(e) => updateFollowupDelay(rule.status_name, Math.max(1, parseInt(e.target.value) || 1), unit)}
            />
            <Select value={unit} onValueChange={(u: DelayUnit) => updateFollowupDelay(rule.status_name, rule.followup_delay_value ?? 2, u)}>
              <SelectTrigger className="w-28" aria-label="Unidade de tempo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DELAY_UNIT_LABELS) as DelayUnit[]).map((u) => <SelectItem key={u} value={u}>{DELAY_UNIT_LABELS[u]}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">contado a partir do primeiro aviso</span>
          </div>
          <Textarea
            value={rule.followup_template ?? ""} className="min-h-[80px]" aria-label="Texto do lembrete"
            placeholder="Texto do lembrete…"
            onChange={(e) => updateRule(rule.status_name, { followup_template: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Se o status mudar antes (ex.: o cliente pagou), o lembrete é cancelado sozinho.</p>
        </>
      )}
    </div>
  );
}
