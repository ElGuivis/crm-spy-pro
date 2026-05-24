import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, ChevronDown, ChevronUp, Plus, Percent, Clock } from "lucide-react";
import {
  type CycleStep, type ReactivationConfig,
  MESSAGE_PLACEHOLDERS,
} from "./reactivationHelpers";

interface Props {
  step: CycleStep;
  index: number;
  totalSteps: number;
  isExpanded: boolean;
  config: ReactivationConfig;
  textareaRefSetter: (el: HTMLTextAreaElement | null) => void;
  onToggleExpand: () => void;
  onRemove: () => void;
  onUpdate: (updates: Partial<CycleStep>) => void;
  onInsertPlaceholder: (placeholder: string) => void;
}

export function ReactivationStepCard({
  step, index, totalSteps, isExpanded, config,
  textareaRefSetter, onToggleExpand, onRemove, onUpdate, onInsertPlaceholder,
}: Props) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs font-mono">{step.stepNumber}º</Badge>
          <span className="text-sm font-medium">
            {index === 0 ? "Primeira mensagem" : `+${step.delayDays} dias após ciclo anterior`}
          </span>
          {!step.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Inativo</Badge>}
        </div>
        <div className="flex items-center gap-1">
          {totalSteps > 1 && (
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-3 border-t">
          <div className="flex items-center gap-3">
            {index > 0 && (
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Dias após ciclo anterior</Label>
                <Input type="number" min={1} max={365}
                  value={step.delayDays}
                  onChange={(e) => onUpdate({ delayDays: Number(e.target.value) })} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label className="text-xs">Ativo</Label>
              <Switch checked={step.isActive} onCheckedChange={(v) => onUpdate({ isActive: v })} />
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {MESSAGE_PLACEHOLDERS.map(p => (
              <Badge key={p.key} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs"
                onClick={() => onInsertPlaceholder(p.key)}>
                <Plus className="h-3 w-3 mr-0.5" /> {p.label}
              </Badge>
            ))}
          </div>

          <Textarea
            ref={textareaRefSetter}
            value={step.messageTemplate}
            onChange={(e) => onUpdate({ messageTemplate: e.target.value })}
            rows={4}
            placeholder={index === 0 ? "Primeira mensagem de reativação..." : `Mensagem do ${step.stepNumber}º ciclo...`}
          />

          <div className="space-y-2 pt-2 border-t border-dashed">
            <div className="flex items-center gap-2">
              <Switch
                checked={step.useCustomCoupon}
                onCheckedChange={(v) => onUpdate({
                  useCustomCoupon: v,
                  couponDiscountPercent: v ? (step.couponDiscountPercent ?? config.couponDiscountPercent) : null,
                  couponDurationDays: v ? (step.couponDurationDays ?? config.couponDurationDays) : null,
                })}
              />
              <Label className="text-xs">Cupom personalizado neste ciclo</Label>
            </div>
            {step.useCustomCoupon && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Percent className="h-3 w-3" /> Desconto (%)</Label>
                  <Input type="number" min={1} max={100}
                    value={step.couponDiscountPercent ?? config.couponDiscountPercent}
                    onChange={(e) => onUpdate({ couponDiscountPercent: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Validade (dias)</Label>
                  <Input type="number" min={1}
                    value={step.couponDurationDays ?? config.couponDurationDays}
                    onChange={(e) => onUpdate({ couponDurationDays: Number(e.target.value) })} />
                </div>
              </div>
            )}
            {!step.useCustomCoupon && (
              <p className="text-xs text-muted-foreground">
                Usando cupom padrão: {config.couponDiscountPercent}% / {config.couponDurationDays} dias
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
