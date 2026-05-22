import { Bell, Store, Save, Loader2, AlertCircle, Mail, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOrderNotificationConfig, getStoreIntegrationIcon, getWhatsAppIntegrationIcon } from "@/hooks/useOrderNotificationConfig";
import { OrderNotificationStatusRules } from "./OrderNotificationStatusRules";

interface OrderNotificationConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId?: string | null;
  onSave: () => void;
}

export function OrderNotificationConfigDialog({ open, onOpenChange, editingId, onSave }: OrderNotificationConfigDialogProps) {
  const {
    config, setConfig, isSaving, isLoading,
    storeIntegrations, whatsappIntegrations, emailIntegrations,
    availableStatuses, isLoadingStatuses,
    toggleStatusRule, updateRuleMessage, updateRuleDelayParts, insertPlaceholder, handleSave,
  } = useOrderNotificationConfig({ open, onOpenChange, editingId, onSave });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500"><Bell className="h-5 w-5" /></div>
            {editingId ? "Editar Notificação de Pedido" : "Nova Notificação de Pedido"}
          </DialogTitle>
          <DialogDescription>Configure notificações automáticas quando pedidos mudarem de status.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Bell className="h-4 w-4 text-muted-foreground" />Nome da Automação</Label>
              <Input placeholder="Ex: Notificações Loja Integrada" value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm font-medium">Automação ativa</span>
              <Switch checked={config.is_active} onCheckedChange={(checked) => setConfig({ ...config, is_active: checked })} />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Store className="h-4 w-4 text-muted-foreground" />Integração da Loja</Label>
              {storeIntegrations.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">Nenhuma loja conectada. Configure uma integração primeiro.</span>
                </div>
              ) : (
                <Select value={config.integration_id || ""} onValueChange={(value) => setConfig({ ...config, integration_id: value })}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                  <SelectContent>
                    {storeIntegrations.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        <span className="flex items-center gap-2"><span>{getStoreIntegrationIcon(i.type)}</span><span>{i.name}</span></span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {config.integration_id && (
              <OrderNotificationStatusRules
                config={config} availableStatuses={availableStatuses} isLoadingStatuses={isLoadingStatuses}
                toggleStatusRule={toggleStatusRule} updateRuleMessage={updateRuleMessage}
                updateRuleDelayParts={updateRuleDelayParts} insertPlaceholder={insertPlaceholder}
              />
            )}

            <div className="space-y-4">
              <Label>Canais de Envio</Label>

              <div className="space-y-2 p-3 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="text-lg">📱</span><span className="font-medium">WhatsApp</span></div>
                  <Switch checked={config.send_via_whatsapp} onCheckedChange={(checked) => setConfig({ ...config, send_via_whatsapp: checked })} />
                </div>
                {config.send_via_whatsapp && (
                  <Select value={config.whatsapp_integration_id || ""} onValueChange={(value) => setConfig({ ...config, whatsapp_integration_id: value })}>
                    <SelectTrigger className="bg-background"><SelectValue placeholder="Selecione o WhatsApp" /></SelectTrigger>
                    <SelectContent>
                      {whatsappIntegrations.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          <span className="flex items-center gap-2"><span>{getWhatsAppIntegrationIcon(i.type)}</span><span>{i.name}</span></span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2 p-3 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Mail className="h-5 w-5" /><span className="font-medium">E-mail</span></div>
                  <Switch checked={config.send_via_email} onCheckedChange={(checked) => setConfig({ ...config, send_via_email: checked })} />
                </div>
                {config.send_via_email && (
                  <Select value={config.email_integration_id || ""} onValueChange={(value) => setConfig({ ...config, email_integration_id: value })}>
                    <SelectTrigger className="bg-background"><SelectValue placeholder="Selecione a integração de e-mail" /></SelectTrigger>
                    <SelectContent>
                      {emailIntegrations.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          <span className="flex items-center gap-2"><Mail className="h-4 w-4" /><span>{i.name}</span><span className="text-xs text-muted-foreground">({i.sender_email})</span></span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
