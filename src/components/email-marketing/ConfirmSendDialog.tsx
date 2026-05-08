import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Loader2, AlertTriangle, Send, Clock } from 'lucide-react';

import { createLogger } from '@/lib/logger';
const log = createLogger('ConfirmSendDialog');

interface ConfirmSendDialogProps {
  campaignId: string;
  campaignName?: string;
  audienceType?: string;
  audienceReference?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ConfirmSendDialog({
  campaignId,
  campaignName,
  audienceType,
  audienceReference,
  open,
  onOpenChange,
  onSuccess,
}: ConfirmSendDialogProps) {
  const [sending, setSending] = useState(false);
  const [estimatedRecipients, setEstimatedRecipients] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    if (!open || !audienceType) {
      setEstimatedRecipients(null);
      return;
    }

    let cancelled = false;
    setEstimating(true);

    let ref: Record<string, unknown> = {};
    if (audienceReference) {
      try { ref = JSON.parse(audienceReference); } catch { /* ignore */ }
    }

    (async () => {
      try {
        const { data, error } = await supabase.rpc('estimate_email_audience', {
          _audience_type: audienceType,
          _audience_reference: ref as Record<string, Json>,
        });
        if (cancelled) return;
        if (!error && data) {
          const d = typeof data === 'string' ? JSON.parse(data) : data;
          setEstimatedRecipients(d.eligible ?? 0);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setEstimating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, audienceType, audienceReference]);

  async function handleSend() {
    if (sending) return;
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('email-campaign-send', {
        body: { campaign_id: campaignId },
      });

      if (error) throw error;

      if (data?.success) {
        const sent = data.sent ?? 0;
        const failed = data.failed ?? 0;
        toast.success(`Campanha enviada! ${sent} entregues${failed > 0 ? `, ${failed} falhas` : ''}.`);
        onSuccess();
        onOpenChange(false);
      } else {
        throw new Error(data?.error || 'Erro ao iniciar envio');
      }
    } catch (error) {
      log.error('Error sending campaign:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao iniciar envio');
    } finally {
      setSending(false);
    }
  }

  const isLargeList = (estimatedRecipients ?? 0) > 250;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Confirmar Envio Real
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Você está prestes a enviar a campanha{' '}
                {campaignName && <strong>"{campaignName}"</strong>} para todos os destinatários elegíveis.
                {estimating && (
                  <span className="text-muted-foreground ml-1">
                    <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                    Estimando…
                  </span>
                )}
                {!estimating && estimatedRecipients != null && estimatedRecipients > 0 && (
                  <span className="font-medium"> (~{estimatedRecipients} destinatários)</span>
                )}
              </p>
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Esta ação <strong>não pode ser desfeita</strong>. Os e-mails serão enviados imediatamente. Contatos na lista de supressão serão ignorados automaticamente.
                </AlertDescription>
              </Alert>
              {isLargeList && (
                <Alert className="py-2 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                    Lista com mais de 250 destinatários — o envio pode levar vários minutos e está sujeito a timeout. Considere dividir em lotes menores para maior confiabilidade.
                  </AlertDescription>
                </Alert>
              )}
              <Alert className="py-2">
                <AlertDescription className="text-xs">
                  Métricas de abertura e clique dependem da integração de eventos do provedor de e-mail. Até essa integração estar ativa, esses indicadores podem permanecer zerados sem representar falha no envio.
                </AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground">
                Certifique-se de que revisou o conteúdo e testou a campanha antes de continuar.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="gap-2 bg-primary text-primary-foreground"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Confirmar Envio
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
