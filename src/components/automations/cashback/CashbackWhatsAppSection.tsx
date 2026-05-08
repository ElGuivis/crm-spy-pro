import { Loader2, AlertCircle, MessageSquare, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CashbackConfig, Integration, WHATSAPP_TYPES, MESSAGE_PLACEHOLDERS, getWhatsAppIntegrationIcon, previewMessage } from "./cashback-config-types";

interface CashbackWhatsAppSectionProps {
  config: CashbackConfig;
  setConfig: (config: CashbackConfig) => void;
  availableIntegrations: Integration[];
  isLoadingIntegrations: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onInsertPlaceholder: (placeholder: string, target?: 'whatsapp' | 'email') => void;
}

export function CashbackWhatsAppSection({
  config,
  setConfig,
  availableIntegrations,
  isLoadingIntegrations,
  textareaRef,
  onInsertPlaceholder,
}: CashbackWhatsAppSectionProps) {
  const whatsappIntegrations = availableIntegrations.filter(i => WHATSAPP_TYPES.includes(i.type));

  return (
    <>
      {/* Send via WhatsApp Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div>
          <p className="text-sm font-medium">Enviar via WhatsApp</p>
          <p className="text-xs text-muted-foreground">
            Envia o cupom automaticamente para o cliente
          </p>
        </div>
        <Switch
          checked={config.sendViaWhatsapp}
          onCheckedChange={(checked) => setConfig({ ...config, sendViaWhatsapp: checked })}
        />
      </div>

      {/* WhatsApp Integration Selection */}
      {config.sendViaWhatsapp && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-green-500" />
            Integração WhatsApp
          </Label>
          {isLoadingIntegrations ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Carregando integrações...</span>
            </div>
          ) : whatsappIntegrations.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-amber-600">
                Nenhuma integração WhatsApp conectada. Configure uma em Integrações.
              </span>
            </div>
          ) : (
            <Select
              value={config.whatsappIntegrationId || ""}
              onValueChange={(value) => setConfig({ ...config, whatsappIntegrationId: value || null })}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Selecione a integração WhatsApp" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border z-50">
                {whatsappIntegrations.map((integration) => (
                  <SelectItem key={integration.id} value={integration.id}>
                    <span className="flex items-center gap-2">
                      <span>{getWhatsAppIntegrationIcon(integration.type)}</span>
                      <span>{integration.name}</span>
                      <span className="text-xs text-muted-foreground">({integration.type.replace(/_/g, ' ')})</span>
                      <span className={`text-xs ${integration.status === 'connected' ? 'text-green-600' : 'text-yellow-600'}`}>
                        • {integration.status === 'connected' ? 'Online' : 'Pendente'}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            Selecione de qual integração WhatsApp a mensagem será enviada
          </p>
        </div>
      )}

      {/* Message Template */}
      {config.sendViaWhatsapp && (
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-green-500" />
            Mensagem do WhatsApp
          </Label>

          <div className="flex flex-wrap gap-1.5">
            {MESSAGE_PLACEHOLDERS.map((placeholder) => (
              <Badge
                key={placeholder.key}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors text-xs"
                onClick={() => onInsertPlaceholder(placeholder.key)}
                title={placeholder.description}
              >
                <Plus className="h-3 w-3 mr-1" />
                {placeholder.label}
              </Badge>
            ))}
          </div>

          <Textarea
            ref={textareaRef}
            value={config.messageTemplate}
            onChange={(e) => setConfig({ ...config, messageTemplate: e.target.value })}
            placeholder="Digite sua mensagem personalizada..."
            className="min-h-[120px] font-mono text-sm"
          />

          <p className="text-xs text-muted-foreground">
            Use os botões acima para inserir variáveis dinâmicas na mensagem.
          </p>

          <div className="p-3 rounded-lg border border-dashed border-green-500/30 bg-green-500/5">
            <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1.5">
              Prévia (exemplo):
            </p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {previewMessage(config.messageTemplate, config.discountPercent, config.durationDays)}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
