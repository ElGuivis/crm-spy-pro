import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { ReactivationStepCard } from "./ReactivationStepCard";
import type { CycleStep, ReactivationConfig } from "./reactivationHelpers";
import type { MutableRefObject } from "react";

interface Props {
  config: ReactivationConfig;
  expandedStep: number | null;
  textareaRefs: MutableRefObject<Record<number, HTMLTextAreaElement | null>>;
  onToggleExpand: (index: number) => void;
  onAddStep: () => void;
  onRemoveStep: (index: number) => void;
  onUpdateStep: (index: number, updates: Partial<CycleStep>) => void;
  onInsertPlaceholder: (index: number, placeholder: string) => void;
}

export function ReactivationStepsList({
  config, expandedStep, textareaRefs,
  onToggleExpand, onAddStep, onRemoveStep, onUpdateStep, onInsertPlaceholder,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Ciclos de mensagem</Label>
        <Button variant="outline" size="sm" onClick={onAddStep}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar ciclo
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada ciclo envia uma mensagem diferente. O intervalo define quantos dias após o ciclo anterior (ou após a detecção de inatividade no 1º ciclo).
      </p>

      <div className="space-y-2">
        {config.cycleSteps.map((step, index) => (
          <ReactivationStepCard
            key={index}
            step={step}
            index={index}
            totalSteps={config.cycleSteps.length}
            isExpanded={expandedStep === index}
            config={config}
            textareaRefSetter={(el) => { textareaRefs.current[index] = el; }}
            onToggleExpand={() => onToggleExpand(index)}
            onRemove={() => onRemoveStep(index)}
            onUpdate={(updates) => onUpdateStep(index, updates)}
            onInsertPlaceholder={(p) => onInsertPlaceholder(index, p)}
          />
        ))}
      </div>
    </div>
  );
}
