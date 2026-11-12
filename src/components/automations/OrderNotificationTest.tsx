import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invokeGoogleAds as invokeFunction } from "@/lib/googleAdsInvoke"; // chama qualquer função e traz a mensagem de erro útil
import type { OrderNotificationConfig, StatusRule } from "@/lib/orderNotification";

/** Manda a mensagem que está na tela, com dados de exemplo, para o seu número ou e-mail (custa 1 token). */
export function OrderNotificationTest({ config, rule }: { config: OrderNotificationConfig; rule: StatusRule }) {
  const channels = [
    ...(config.send_via_whatsapp && config.whatsapp_integration_id ? [{ id: "whatsapp", label: "WhatsApp" }] : []),
    ...(config.send_via_email && config.email_integration_id ? [{ id: "email", label: "E-mail" }] : []),
  ];
  const [channel, setChannel] = useState<string>("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  if (!channels.length) return <p className="text-xs text-muted-foreground">Escolha um canal de envio (WhatsApp ou e-mail) para poder enviar um teste.</p>;
  const current = channels.some((c) => c.id === channel) ? channel : channels[0].id;

  const send = async () => {
    setSending(true);
    try {
      await invokeFunction("order-notification-test", {
        channel: current, to, message_template: rule.message_template, email_subject: rule.email_subject, email_body: rule.email_body,
        whatsapp_integration_id: config.whatsapp_integration_id, email_integration_id: config.email_integration_id,
      });
      toast.success(`Teste enviado para ${to}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSending(false); }
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`test-to-${rule.status_name}`}>Enviar teste para</Label>
        <div className="flex gap-2">
          {channels.length > 1 && (
            <Select value={current} onValueChange={setChannel}>
              <SelectTrigger className="w-28" aria-label="Canal do teste"><SelectValue /></SelectTrigger>
              <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Input
            id={`test-to-${rule.status_name}`} className="w-56" value={to} onChange={(e) => setTo(e.target.value)}
            placeholder={current === "email" ? "seu@email.com" : "DDD + número, ex.: 11999998888"} inputMode={current === "email" ? "email" : "tel"}
          />
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={sending || !to.trim() || !rule.message_template.trim()} onClick={send}>
        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar teste
      </Button>
    </div>
  );
}
