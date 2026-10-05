import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useRecoveryFunnel, type FunnelRow } from "@/hooks/useRecoveryData";
import { useRecoveryFlows } from "@/hooks/useRecoveryFlows";
import { RECOVERY_KINDS } from "@/lib/recovery";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "–");

function Bar({ label, value, base, tone = "bg-primary" }: { label: string; value: number; base: number; tone?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value} <span className="text-muted-foreground">({pct(value, base)})</span></span></div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${base > 0 ? Math.min(100, (value / base) * 100) : 0}%` }} /></div>
    </div>
  );
}

function KindCard({ kind, label, row, enabled }: { kind: string; label: string; row: FunnelRow | undefined; enabled: boolean }) {
  const r = row ?? { captured: 0, with_contact: 0, contacted: 0, opened: 0, clicked: 0, recovered_ours: 0, recovered_other: 0, revenue_ours: 0, whatsapp_sent: 0 } as FunnelRow;
  return (
    <Card key={kind}>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{label}</CardTitle>
        {enabled ? <Badge>Fluxo ligado</Badge> : <Badge variant="secondary">Fluxo desligado</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-3xl font-bold">{brl(r.revenue_ours)}</p>
          <p className="text-xs text-muted-foreground">recuperados pelo nosso fluxo ({r.recovered_ours} pedido{r.recovered_ours === 1 ? "" : "s"})</p>
        </div>
        <div className="space-y-2">
          <Bar label="Abandonos capturados" value={r.captured} base={r.captured} tone="bg-muted-foreground/50" />
          <Bar label="Com e-mail ou telefone" value={r.with_contact} base={r.captured} tone="bg-muted-foreground/50" />
          <Bar label="Contatados pelo nosso fluxo" value={r.contacted} base={r.with_contact} />
          <Bar label="Abriram o e-mail" value={r.opened} base={r.contacted} />
          <Bar label="Clicaram" value={r.clicked} base={r.contacted} />
          <Bar label="Compraram (nosso fluxo)" value={r.recovered_ours} base={r.contacted} tone="bg-emerald-500" />
        </div>
        <p className="text-xs text-muted-foreground">
          Compraram por outro caminho (inclui a automação nativa da loja): <strong>{r.recovered_other}</strong>
          {r.whatsapp_sent > 0 && <> · WhatsApp enviados: <strong>{r.whatsapp_sent}</strong></>}
        </p>
      </CardContent>
    </Card>
  );
}

/** Resultado da recuperação por tipo, no período escolhido. */
export function RecoverySummary() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useRecoveryFunnel(days);
  const { flows } = useRecoveryFlows();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          A recuperação conta a compra do mesmo e-mail depois do abandono (até 7 dias). "Nosso fluxo" só conta quem recebeu algo nosso antes de comprar.
        </p>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>{[7, 30, 90].map((d) => <SelectItem key={d} value={String(d)}>Últimos {d} dias</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {isLoading ? <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {RECOVERY_KINDS.map((k) => <KindCard key={k.kind} kind={k.kind} label={k.label} row={data?.[k.kind]} enabled={flows[k.kind].enabled} />)}
        </div>
      )}
    </div>
  );
}
