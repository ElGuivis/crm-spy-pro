import { sanitizeHtml } from "@/lib/sanitize-html";
import { Mail, AlertCircle, Plus, MessageSquare, Code, Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CashbackConfig, EmailIntegration, MESSAGE_PLACEHOLDERS, previewMessage } from "./cashback-config-types";

interface CashbackEmailSectionProps {
  config: CashbackConfig;
  setConfig: (config: CashbackConfig) => void;
  emailIntegrations: EmailIntegration[];
  emailEditMode: 'simple' | 'html';
  setEmailEditMode: (mode: 'simple' | 'html') => void;
  emailTextareaRef: React.RefObject<HTMLTextAreaElement>;
  onInsertPlaceholder: (placeholder: string, target?: 'whatsapp' | 'email') => void;
  onInsertEmailSubjectPlaceholder: (placeholder: string) => void;
}

export function CashbackEmailSection({
  config,
  setConfig,
  emailIntegrations,
  emailEditMode,
  setEmailEditMode,
  emailTextareaRef,
  onInsertPlaceholder,
  onInsertEmailSubjectPlaceholder,
}: CashbackEmailSectionProps) {
  return (
    <>
      {/* Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-500" />
            Enviar via E-mail
          </p>
          <p className="text-xs text-muted-foreground">
            Envia o cupom por e-mail para o cliente
          </p>
        </div>
        <Switch
          checked={config.sendViaEmail}
          onCheckedChange={(checked) => setConfig({ ...config, sendViaEmail: checked })}
        />
      </div>

      {/* Email Configuration */}
      {config.sendViaEmail && (
        <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
          {/* Email Integration Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" />
              Integração SMTP
            </Label>
            {emailIntegrations.length === 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-600">
                  Nenhuma integração de e-mail configurada. Configure uma em Integrações.
                </span>
              </div>
            ) : (
              <Select
                value={config.emailIntegrationId || ""}
                onValueChange={(value) => setConfig({ ...config, emailIntegrationId: value || null })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Selecione a integração SMTP" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border z-50">
                  {emailIntegrations.map((integration) => (
                    <SelectItem key={integration.id} value={integration.id}>
                      <span className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-blue-500" />
                        <span>{integration.name}</span>
                        <span className="text-xs text-muted-foreground">({integration.sender_email})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Email Subject */}
          <div className="space-y-2">
            <Label>Assunto do E-mail</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {MESSAGE_PLACEHOLDERS.slice(0, 3).map((placeholder) => (
                <Badge
                  key={placeholder.key}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors text-xs"
                  onClick={() => onInsertEmailSubjectPlaceholder(placeholder.key)}
                  title={placeholder.description}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {placeholder.label}
                </Badge>
              ))}
            </div>
            <Input
              value={config.emailSubject}
              onChange={(e) => setConfig({ ...config, emailSubject: e.target.value })}
              placeholder="Ex: Seu cupom de desconto chegou!"
            />
          </div>

          {/* Email Body Mode Selector */}
          <div className="space-y-2">
            <Label>Conteúdo do E-mail</Label>
            <Tabs value={emailEditMode} onValueChange={(v) => setEmailEditMode(v as 'simple' | 'html')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="simple" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Texto Simples
                </TabsTrigger>
                <TabsTrigger value="html" className="gap-2">
                  <Code className="h-4 w-4" />
                  HTML Personalizado
                </TabsTrigger>
              </TabsList>

              <TabsContent value="simple" className="space-y-3 mt-3">
                <div className="flex flex-wrap gap-1.5">
                  {MESSAGE_PLACEHOLDERS.map((placeholder) => (
                    <Badge
                      key={placeholder.key}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors text-xs"
                      onClick={() => onInsertPlaceholder(placeholder.key, 'email')}
                      title={placeholder.description}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {placeholder.label}
                    </Badge>
                  ))}
                </div>

                <Textarea
                  ref={emailTextareaRef}
                  value={config.emailBodyText}
                  onChange={(e) => setConfig({ ...config, emailBodyText: e.target.value })}
                  placeholder="Digite o conteúdo do e-mail..."
                  className="min-h-[150px] font-mono text-sm"
                />

                <div className="p-3 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30">
                  <p className="text-xs font-medium text-foreground mb-1.5 flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    Prévia (exemplo):
                  </p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {previewMessage(config.emailBodyText, config.discountPercent, config.durationDays)}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="html" className="space-y-3 mt-3">
                <p className="text-xs text-muted-foreground">
                  Cole seu código HTML personalizado. Use as variáveis: {'{{'}cliente_nome{'}}'}, {'{{'}cupom{'}}'}, {'{{'}valor_cupom{'}}'}, {'{{'}validade{'}}'}
                </p>

                <Textarea
                  value={config.emailBodyHtml}
                  onChange={(e) => setConfig({ ...config, emailBodyHtml: e.target.value })}
                  placeholder="<html>&#10;<body>&#10;  <h1>Seu cupom chegou!</h1>&#10;  <p>Use o código: {{cupom}}</p>&#10;</body>&#10;</html>"
                  className="min-h-[200px] font-mono text-xs"
                />

                {config.emailBodyHtml && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      Prévia HTML:
                    </p>
                    <div
                      className="p-4 rounded-lg border bg-white text-black overflow-auto max-h-[300px]"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(
                          previewMessage(config.emailBodyHtml, config.discountPercent, config.durationDays),
                          'emailPreview'
                        )
                      }}
                    />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </>
  );
}
