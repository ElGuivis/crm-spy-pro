import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Monitor, Smartphone, AlertTriangle, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { EmailCampaign } from '@/hooks/useEmailCampaigns';
import { generateEmailHTML } from './editor/htmlGenerator';
import { replaceVariablesWithSample } from '@/lib/email-variables';

interface CampaignReviewDialogProps {
  campaign: EmailCampaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProceed: () => void;
}

export function CampaignReviewDialog({
  campaign,
  open,
  onOpenChange,
  onProceed,
}: CampaignReviewDialogProps) {
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const validations = {
    hasSubject: { valid: !!campaign.subject, label: 'Assunto definido', critical: true },
    hasSender: { valid: !!campaign.sender_email, label: 'Remetente configurado', critical: true },
    hasContent: { valid: !!(campaign.content_json as any)?.blocks?.length, label: 'Conteúdo criado', critical: true },
    hasUnsubscribe: {
      valid: (campaign.content_json as any)?.blocks?.some((b: any) => b.type === 'unsubscribe') ?? false,
      label: 'Bloco de descadastro presente (obrigatório por conformidade)',
      critical: true,
    },
  };

  const criticalIssues = Object.values(validations).filter(v => v.critical && !v.valid);
  const isValid = criticalIssues.length === 0;

  const previewHtml = campaign.content_json
    ? replaceVariablesWithSample(generateEmailHTML(campaign.content_json as any, campaign.preheader || undefined))
    : '';

  const previewSubject = replaceVariablesWithSample(campaign.subject || '');
  const previewPreheader = replaceVariablesWithSample(campaign.preheader || '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Revisar Campanha antes do Envio</DialogTitle>
          <DialogDescription>
            Verifique todos os detalhes antes de prosseguir para o envio real.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Campaign Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Nome Interno</p>
              <p className="font-medium">{campaign.internal_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Tipo</p>
              <Badge variant="outline">{campaign.campaign_type}</Badge>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Assunto</p>
              <p>{previewSubject}</p>
            </div>
            {campaign.preheader && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Preheader</p>
                <p className="text-muted-foreground">{previewPreheader}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Remetente</p>
              <p>{campaign.sender_name} &lt;{campaign.sender_email}&gt;</p>
            </div>
            {campaign.reply_to && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Reply-To</p>
                <p className="text-muted-foreground">{campaign.reply_to}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Validations */}
          <div>
            <h4 className="font-medium mb-3">Checklist de conformidade</h4>
            <div className="space-y-2">
              {Object.values(validations).map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  {item.valid ? (
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  )}
                  <span className={`text-sm ${!item.valid ? 'text-destructive font-medium' : ''}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {!isValid && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {criticalIssues.length} problema(s) crítico(s) impedem o envio. Volte e corrija antes de continuar.
              </AlertDescription>
            </Alert>
          )}

          <Separator />

          <Alert>
            <AlertDescription className="text-xs">
              Entregas, falhas e descadastros estão operacionais. Métricas de abertura e clique ficam dependentes da integração de eventos do provedor (webhooks/tracking) e podem aparecer como 0 até essa conexão ser concluída.
            </AlertDescription>
          </Alert>

          <Separator />
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Pré-visualização</h4>
              <div className="flex gap-2">
                <Button
                  variant={previewMode === 'desktop' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewMode('desktop')}
                >
                  <Monitor className="h-4 w-4 mr-1.5" />
                  Desktop
                </Button>
                <Button
                  variant={previewMode === 'mobile' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewMode('mobile')}
                >
                  <Smartphone className="h-4 w-4 mr-1.5" />
                  Mobile
                </Button>
              </div>
            </div>

            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">Visual</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="mt-3">
                {previewHtml ? (
                  <div
                    className={`border rounded-lg overflow-hidden mx-auto transition-all duration-300 ${
                      previewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-full'
                    }`}
                  >
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-[480px] bg-white"
                      title="Email Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  <div className="border rounded-lg h-[200px] flex items-center justify-center text-muted-foreground text-sm bg-muted/20">
                    Nenhum conteúdo para pré-visualizar ainda.
                  </div>
                )}
              </TabsContent>
              <TabsContent value="html" className="mt-3">
                <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto max-h-[400px] leading-relaxed">
                  <code>{previewHtml || '(sem conteúdo)'}</code>
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar e Editar
          </Button>
          <Button onClick={onProceed} disabled={!isValid} className="gap-2">
            Prosseguir para Envio
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
