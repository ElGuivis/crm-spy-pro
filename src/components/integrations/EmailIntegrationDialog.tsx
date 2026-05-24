import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";
import { useEmailIntegrationForm, type EmailIntegration } from "@/hooks/useEmailIntegrationForm";
import { EmailIntegrationBasicFields } from "./email/EmailIntegrationBasicFields";
import { EmailIntegrationSmtpFields } from "./email/EmailIntegrationSmtpFields";
import { EmailIntegrationLimits } from "./email/EmailIntegrationLimits";
import { EmailIntegrationSenders } from "./email/EmailIntegrationSenders";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration?: EmailIntegration | null;
  onSuccess: () => void;
}

export function EmailIntegrationDialog({ open, onOpenChange, integration, onSuccess }: Props) {
  const f = useEmailIntegrationForm({ integration, open, onSuccess, onOpenChange });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {integration ? "Editar" : "Nova"} Integração de E-mail
          </DialogTitle>
          <DialogDescription>
            Configure as credenciais SMTP para envio de e-mails.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={f.handleSubmit} className="space-y-4">
          <EmailIntegrationBasicFields
            formData={f.formData}
            onChange={(field, value) => f.updateField(field as any, value)}
          />

          <EmailIntegrationSmtpFields
            formData={f.formData}
            isEditing={!!integration}
            onChange={(field, value) => f.updateField(field as any, value)}
            onPortChange={f.handlePortChange}
            onSecureChange={f.handleSecureChange}
            onTlsChange={f.handleTlsChange}
          />

          <EmailIntegrationLimits
            dailyLimit={f.formData.daily_send_limit}
            maxPerSecond={f.formData.max_sends_per_second}
            onDailyLimitChange={(v) => f.updateField("daily_send_limit", v)}
            onMaxPerSecondChange={(v) => f.updateField("max_sends_per_second", v)}
          />

          <EmailIntegrationSenders
            senders={f.senders}
            loadingSenders={f.loadingSenders}
            activeSendersCount={f.activeSendersCount}
            onAdd={f.addSender}
            onUpdate={f.updateSender}
            onRemove={f.removeSender}
          />

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={f.isLoading}>
              {f.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {integration ? "Salvar Alterações" : "Criar Integração"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
