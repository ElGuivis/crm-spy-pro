import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, AlertTriangle, CheckCircle2 } from "lucide-react";

interface TestEmailButtonProps {
  emailIntegrationId: string;
  disabled?: boolean;
}

export function TestEmailButton({ emailIntegrationId, disabled }: TestEmailButtonProps) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [diagnostico, setDiagnostico] = useState<any>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to) return;

    setIsSending(true);
    setDiagnostico(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          email_integration_id: emailIntegrationId,
          email_para: to,
          assunto: "Teste SMTP - SpyPro",
          mensagem: "Este é um e-mail de teste para validar sua configuração SMTP.",
          mensagem_html:
            "<p>Este é um e-mail de teste para validar sua configuração <strong>SMTP</strong>.</p><p style='color:#888;font-size:12px;margin-top:16px;'>Enviado via SpyPro CRM</p>",
          // remetente_nome não enviado → edge function usa sender_name da integração
        },
      });

      if (error) {
        // Extract real error message from edge function response body
        let realMessage = error.message;
        let dica: string | undefined;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.mensagem) realMessage = body.mensagem;
          if (body?.dica) dica = body.dica;
        } catch { /* ignore parse errors */ }
        const err = new Error(realMessage) as Error & { dica?: string };
        err.dica = dica;
        throw err;
      }
      if ((data as any)?.status === "erro") {
        throw new Error((data as any)?.mensagem || "Falha ao enviar e-mail");
      }

      const diag = (data as any)?.diagnostico;
      setDiagnostico(diag);

      toast.success("E-mail aceito pelo servidor SMTP!", {
        description: `Verifique a caixa de entrada (e spam) de ${to}. Se usa Amazon SES em modo Sandbox, o destinatário precisa estar verificado.`,
        duration: 8000,
      });
    } catch (err: any) {
      const dica = (err as any)?.dica;
      toast.error("Falha no teste SMTP", {
        description: dica || err?.message || "Não foi possível enviar o e-mail de teste.",
        duration: 8000,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => { setOpen(true); setDiagnostico(null); }}
        disabled={disabled}
      >
        <Mail className="h-4 w-4" />
        Testar SMTP
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Testar SMTP</DialogTitle>
            <DialogDescription>
              Envia um e-mail real usando esta integração para validar host, porta e credenciais.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSend} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-email-to">Enviar para</Label>
              <Input
                id="test-email-to"
                type="email"
                placeholder="ex: seuemail@dominio.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>

            {diagnostico && (
              <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  SMTP aceitou o envio
                </div>
                <div className="text-muted-foreground space-y-1">
                  <p><strong>Host:</strong> {diagnostico.smtp_host}:{diagnostico.smtp_port} ({diagnostico.security_mode})</p>
                  <p><strong>Remetente:</strong> {diagnostico.sender_email}</p>
                  <p><strong>Destinatário:</strong> {diagnostico.destinatario}</p>
                </div>
                <div className="flex items-start gap-2 mt-2 p-2 rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-xs">
                    Se o e-mail não chegar, verifique: <strong>1)</strong> Modo Sandbox do SES (destinatário precisa estar verificado){" "}
                    <strong>2)</strong> Domínio/remetente verificado no provedor{" "}
                    <strong>3)</strong> Pasta de spam{" "}
                    <strong>4)</strong> Registros SPF/DKIM/DMARC do domínio
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSending}>
                {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar teste
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
