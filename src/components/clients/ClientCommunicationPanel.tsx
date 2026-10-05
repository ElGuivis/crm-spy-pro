import { Loader2, MailX, PhoneOff, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCustomerCommunication } from "@/hooks/useCustomerCommunication";

const PURPOSE: Record<string, string> = {
  campaign: "Campanha de e-mail", bulk: "Disparo em massa", recovery: "Recuperação de abandono", welcome: "Boas-vindas",
  cashback: "Cashback", cashback_reminder: "Lembrete de cashback", birthday: "Aniversário", reactivation: "Reativação",
};
const ORIGIN: Record<string, string> = { ...PURPOSE, email_campaign: "Campanha de e-mail", manual: "Manual", loyalty: "Fidelidade", imported: "Importado" };
const SUPPRESSION: Record<string, string> = { unsubscribed: "descadastrou", bounced: "e-mail inválido (bounce)", complained: "marcou como spam", invalid: "e-mail inválido", blocked: "bloqueado" };
const fmt = (d?: string | null) => (d ? format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR }) : "—");
const brl = (v?: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

/** Aba "Comunicação" do cliente: o que recebeu (todos os módulos), cupons emitidos/usados e se pode receber mensagens. */
export function ClientCommunicationPanel({ email, phone }: { email?: string | null; phone?: string | null }) {
  const { data, isLoading, isError } = useCustomerCommunication(email, phone, true);
  if (isLoading) return <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (isError || !data) return <p className="text-sm text-muted-foreground py-4">Não foi possível carregar a comunicação deste cliente.</p>;

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap gap-2">
        {data.suppression ? <Badge variant="destructive" className="gap-1"><MailX className="h-3 w-3" />E-mail suprimido: {SUPPRESSION[data.suppression.reason] ?? data.suppression.reason}</Badge>
          : <Badge variant="secondary">E-mail liberado</Badge>}
        {data.phone_blocked && <Badge variant="destructive" className="gap-1"><PhoneOff className="h-3 w-3" />Telefone bloqueado</Badge>}
        {data.newsletter && <Badge variant="outline" className="gap-1"><Newspaper className="h-3 w-3" />{data.newsletter.removed ? "Saiu da newsletter" : "Newsletter da loja"}</Badge>}
      </div>

      <section>
        <h4 className="font-medium mb-1.5">Últimos envios (todos os módulos)</h4>
        {!data.touches.length ? <p className="text-muted-foreground text-xs">Nenhum envio registrado nos últimos 90 dias.</p> : (
          <ul className="divide-y rounded-md border">
            {data.touches.map((t, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-1.5">
                <span>{PURPOSE[t.purpose] ?? t.purpose} <span className="text-xs text-muted-foreground">· {t.channel === "email" ? "E-mail" : "WhatsApp"}</span></span>
                <span className="text-xs text-muted-foreground">{fmt(t.sent_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="font-medium mb-1.5">Campanhas de e-mail recebidas</h4>
        {!data.campaigns.length ? <p className="text-muted-foreground text-xs">Nenhuma.</p> : (
          <ul className="divide-y rounded-md border">
            {data.campaigns.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="truncate">{c.campaign_name || c.subject || "Campanha"}{c.flow_kind ? <span className="text-xs text-muted-foreground"> · recuperação/boas-vindas</span> : null}</span>
                <span className="text-xs text-muted-foreground shrink-0">{c.status ?? ""} · {fmt(c.sent_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="font-medium mb-1.5">Cupons</h4>
        {!data.coupons.length ? <p className="text-muted-foreground text-xs">Nenhum cupom emitido para esta pessoa.</p> : (
          <ul className="divide-y rounded-md border">
            {data.coupons.map((c) => (
              <li key={c.coupon_code} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span><span className="font-mono">{c.coupon_code}</span> <span className="text-xs text-muted-foreground">· {ORIGIN[c.origin_type ?? ""] ?? c.origin_type ?? "—"}</span></span>
                <span className="text-xs shrink-0">{c.used_at ? <span className="text-green-700">usado {fmt(c.used_at)} {brl(c.used_order_value)}</span> : <span className="text-muted-foreground">emitido {fmt(c.created_at)}{c.expires_at ? ` · vence ${fmt(c.expires_at).slice(0, 8)}` : ""}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
