import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Repeat, Save, Loader2 } from "lucide-react";
import { useReactivationConfig } from "@/hooks/useReactivationConfig";
import { ReactivationBasicFields } from "./reactivation/ReactivationBasicFields";
import { ReactivationStepsList } from "./reactivation/ReactivationStepsList";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId?: string | null;
  onSave: () => void;
}

export function ReactivationConfigDialog({ open, onOpenChange, editingId, onSave }: Props) {
  const r = useReactivationConfig({ open, editingId, onSave, onOpenChange });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-violet-500" />
            {editingId ? "Editar" : "Nova"} Reativação de Clientes
          </DialogTitle>
          <DialogDescription>
            Reengaje clientes inativos automaticamente com ciclos de mensagens e cupons de desconto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <ReactivationBasicFields
            config={r.config}
            setConfig={r.setConfig}
            integrations={r.integrations}
            isLoadingIntegrations={r.isLoadingIntegrations}
          />

          <ReactivationStepsList
            config={r.config}
            expandedStep={r.expandedStep}
            textareaRefs={r.textareaRefs}
            onToggleExpand={(i) => r.setExpandedStep(r.expandedStep === i ? null : i)}
            onAddStep={r.addStep}
            onRemoveStep={r.removeStep}
            onUpdateStep={r.updateStep}
            onInsertPlaceholder={r.insertPlaceholder}
          />

          <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 text-sm space-y-1">
            <p className="font-medium text-violet-700 dark:text-violet-300">ℹ️ Como funciona</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Apenas pedidos feitos <strong>após a ativação</strong> são considerados</li>
              <li>Clientes sem compras nos últimos <strong>{r.config.inactivityDays} dias</strong> entram no fluxo</li>
              <li>Cada ciclo envia uma <strong>mensagem diferente</strong> com intervalo configurável</li>
              {r.config.maxCycles > 0
                ? <li>Após <strong>{r.config.maxCycles} ciclo(s)</strong> sem resposta, o cliente é descartado</li>
                : <li>Os ciclos se <strong>repetem indefinidamente</strong> enquanto o cliente estiver inativo</li>}
            </ul>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-sm">
            <span className="text-muted-foreground">Custo por execução:</span>
            <span className="font-semibold text-primary">5 tokens</span>
          </div>

          <Button className="w-full" onClick={r.handleSave} disabled={r.isSaving}>
            {r.isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {editingId ? "Atualizar" : "Criar"} Automação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
