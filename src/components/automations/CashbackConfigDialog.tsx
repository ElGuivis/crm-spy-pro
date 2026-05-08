import { Gift, Percent, Clock, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CashbackConfigDialogProps } from "./cashback/cashback-config-types";
import { useCashbackConfigForm } from "./cashback/useCashbackConfigForm";
import { CashbackStoreSection } from "./cashback/CashbackStoreSection";
import { CashbackWhatsAppSection } from "./cashback/CashbackWhatsAppSection";
import { CashbackEmailSection } from "./cashback/CashbackEmailSection";
import { CashbackRemindersSection } from "./cashback/CashbackRemindersSection";

export function CashbackConfigDialog({
  open,
  onOpenChange,
  editingId,
  initialConfig,
  onSave,
}: CashbackConfigDialogProps) {
  const {
    config,
    setConfig,
    isSaving,
    textareaRef,
    emailTextareaRef,
    availableIntegrations,
    emailIntegrations,
    isLoadingIntegrations,
    availableStatuses,
    isLoadingStatuses,
    emailEditMode,
    setEmailEditMode,
    handleStatusToggle,
    insertPlaceholder,
    insertEmailSubjectPlaceholder,
    handleSave,
  } = useCashbackConfigForm({
    open,
    editingId,
    initialConfig,
    onSave,
    onClose: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Gift className="h-5 w-5" />
            </div>
            {editingId ? "Editar Cashback" : "Novo Cashback"}
          </DialogTitle>
          <DialogDescription>
            {editingId
              ? "Atualize a configuração da automação de cashback."
              : "Configure uma nova automação de cashback para enviar cupons de desconto após compras."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-muted-foreground" />
              Nome do Cashback
            </Label>
            <Input
              placeholder="Ex: Cashback Black Friday"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Um nome para identificar este cashback na página de cupons
            </p>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <span className="text-sm font-medium">Automação ativa</span>
            <Switch
              checked={config.isActive}
              onCheckedChange={(checked) => setConfig({ ...config, isActive: checked })}
            />
          </div>

          {/* Store & Status */}
          <CashbackStoreSection
            config={config}
            setConfig={setConfig}
            availableIntegrations={availableIntegrations}
            isLoadingIntegrations={isLoadingIntegrations}
            availableStatuses={availableStatuses}
            isLoadingStatuses={isLoadingStatuses}
            onStatusToggle={handleStatusToggle}
          />

          {/* Discount Percent */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-muted-foreground" />
              Porcentagem de Desconto
            </Label>
            <div className="relative">
              <Input
                type="number"
                min={1}
                max={100}
                value={config.discountPercent}
                onChange={(e) => setConfig({ ...config, discountPercent: parseInt(e.target.value) || 0 })}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Porcentagem de desconto que será aplicada no cupom gerado
            </p>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Validade do Cupom
            </Label>
            <div className="relative">
              <Input
                type="number"
                min={1}
                value={config.durationDays}
                onChange={(e) => setConfig({ ...config, durationDays: parseInt(e.target.value) || 0 })}
                className="pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">dias</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Quantos dias o cupom ficará válido após a geração
            </p>
          </div>

          {/* Min/Max values */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Compra mínima (R$)</Label>
              <Input
                type="number"
                min={0}
                placeholder="Sem mínimo"
                value={config.minPurchaseValue ?? ""}
                onChange={(e) => setConfig({ ...config, minPurchaseValue: e.target.value ? parseFloat(e.target.value) : null })}
              />
              <p className="text-xs text-muted-foreground">Deixe vazio para sem mínimo</p>
            </div>
            <div className="space-y-2">
              <Label>Desconto máximo (R$)</Label>
              <Input
                type="number"
                min={0}
                placeholder="Sem limite"
                value={config.maxDiscountValue ?? ""}
                onChange={(e) => setConfig({ ...config, maxDiscountValue: e.target.value ? parseFloat(e.target.value) : null })}
              />
              <p className="text-xs text-muted-foreground">Deixe vazio para sem limite</p>
            </div>
          </div>

          {/* WhatsApp */}
          <CashbackWhatsAppSection
            config={config}
            setConfig={setConfig}
            availableIntegrations={availableIntegrations}
            isLoadingIntegrations={isLoadingIntegrations}
            textareaRef={textareaRef}
            onInsertPlaceholder={insertPlaceholder}
          />

          {/* Email */}
          <CashbackEmailSection
            config={config}
            setConfig={setConfig}
            emailIntegrations={emailIntegrations}
            emailEditMode={emailEditMode}
            setEmailEditMode={setEmailEditMode}
            emailTextareaRef={emailTextareaRef}
            onInsertPlaceholder={insertPlaceholder}
            onInsertEmailSubjectPlaceholder={insertEmailSubjectPlaceholder}
          />

          {/* Reminders */}
          <CashbackRemindersSection config={config} setConfig={setConfig} />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="gap-2" disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Configuração
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
