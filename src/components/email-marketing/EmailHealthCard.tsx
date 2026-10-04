import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Level = "ok" | "warn" | "bad";
const rate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const fmt = (v: number) => `${v.toFixed(v < 1 && v > 0 ? 2 : 1).replace(".", ",")}%`;
const grade = (v: number, warn: number, bad: number): Level => (v >= bad ? "bad" : v >= warn ? "warn" : "ok");
const COLORS: Record<Level, string> = { ok: "text-green-600", warn: "text-amber-600", bad: "text-red-600" };

/** Saúde do envio nos últimos 30 dias, com limites que os provedores (Gmail, Yahoo, SES) usam para punir remetentes. */
export function EmailHealthCard() {
  const { tenantId } = useAuth();
  const { data } = useQuery({
    queryKey: ["email-health", tenantId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("get_email_health", { p_tenant_id: tenantId!, p_days: 30 });
      if (error) throw error;
      return rows?.[0] ?? null;
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
  if (!data || data.campaigns === 0) return null;

  const attempted = data.sent + data.failed;
  const items: { label: string; value: string; level: Level; hint: string }[] = [
    { label: "Falhas de envio", value: fmt(rate(data.failed, attempted)), level: grade(rate(data.failed, attempted), 3, 8), hint: `${data.failed} de ${attempted} e-mails` },
    { label: "Descadastros", value: fmt(rate(data.unsubscribed, data.sent)), level: grade(rate(data.unsubscribed, data.sent), 0.5, 1.5), hint: `${data.unsubscribed} pessoas` },
    { label: "Endereços inválidos (bounce)", value: fmt(rate(data.bounced, data.sent)), level: grade(rate(data.bounced, data.sent), 2, 5), hint: data.bounced ? `${data.bounced} endereços` : "só medido com o webhook do provedor" },
    { label: "Reclamações de spam", value: fmt(rate(data.complaints, data.sent)), level: grade(rate(data.complaints, data.sent), 0.05, 0.1), hint: data.complaints ? `${data.complaints} pessoas` : "só medido com o webhook do provedor" },
  ];
  const worst: Level = data.stuck_campaigns > 0 ? "bad" : items.some((i) => i.level === "bad") ? "bad" : items.some((i) => i.level === "warn") ? "warn" : "ok";
  const Icon = worst === "ok" ? CheckCircle2 : worst === "warn" ? AlertTriangle : ShieldAlert;
  const title = worst === "ok" ? "Envio saudável" : worst === "warn" ? "Atenção com o envio" : "Envio precisa de cuidado";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm flex items-center gap-2 ${COLORS[worst]}`}><Icon className="h-4 w-4" />{title} <span className="text-xs font-normal text-muted-foreground">(últimos 30 dias)</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.stuck_campaigns > 0 && (
          <p className="text-sm text-red-600">{data.stuck_campaigns} campanha(s) parecem travadas no envio. Abra a campanha e use Pausar e Retomar.</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map((i) => (
            <div key={i.label} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{i.label}</div>
              <div className={`text-lg font-semibold ${COLORS[i.level]}`}>{i.value}</div>
              <div className="text-[11px] text-muted-foreground">{i.hint}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Referências dos provedores: reclamações abaixo de 0,1%, descadastros abaixo de 0,5% e bounces abaixo de 2%. Passar disso derruba a entrega na caixa de entrada.</p>
      </CardContent>
    </Card>
  );
}
