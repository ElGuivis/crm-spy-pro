import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeGoogleAds as invokeFunction } from "@/lib/googleAdsInvoke"; // chama qualquer função e traz a mensagem de erro útil

/** Manda a mensagem do ciclo, com dados de exemplo (cupom TESTE10), para o seu WhatsApp. Custa 1 token e não cria cupom na loja. */
export function ReactivationTest({ whatsappIntegrationId, message }: { whatsappIntegrationId: string | null; message: string }) {
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  if (!whatsappIntegrationId) return <p className="text-xs text-muted-foreground">Escolha o WhatsApp da automação para poder enviar um teste.</p>;

  const send = async () => {
    setSending(true);
    try {
      await invokeFunction("order-notification-test", { kind: "reactivation", channel: "whatsapp", to, message_template: message, whatsapp_integration_id: whatsappIntegrationId });
      toast.success(`Teste enviado para ${to}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSending(false); }
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="react-test-to">Enviar teste para</Label>
        <Input id="react-test-to" className="w-56" value={to} onChange={(e) => setTo(e.target.value)} placeholder="DDD + número, ex.: 11999998888" inputMode="tel" />
      </div>
      <Button type="button" variant="outline" size="sm" disabled={sending || !to.trim() || !message.trim()} onClick={send}>
        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar teste
      </Button>
    </div>
  );
}
