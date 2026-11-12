import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EconomicsRecon } from "@/components/google-ads/EconomicsRecon";
import type { useGoogleAdsEconomics } from "@/hooks/useGoogleAdsEconomics";
import { useGa4Monthly } from "@/hooks/useGa4Monthly";
import { parseNumber, pct, reais, x, type EconomicsView } from "@/lib/googleAdsEconomics";

const fmt = (n: number) => String(n).replace(".", ",");
const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-base font-semibold">{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
);

function Settings({ v, canEdit, saving, onSave }: { v: EconomicsView; canEdit: boolean; saving: boolean; onSave: (b: { inputs: { tax_pct: number; gateway_fee_pct: number; shipping_cost_ratio: number } }) => void }) {
  const [tax, setTax] = useState(fmt(v.inputs.tax_pct));
  const [fee, setFee] = useState(fmt(v.inputs.gateway_fee_pct));
  const [ship, setShip] = useState(fmt(v.inputs.shipping_cost_ratio));
  useEffect(() => { setTax(fmt(v.inputs.tax_pct)); setFee(fmt(v.inputs.gateway_fee_pct)); setShip(fmt(v.inputs.shipping_cost_ratio)); }, [v.inputs]);
  const t = parseNumber(tax), f = parseNumber(fee), s = parseNumber(ship);
  const invalid = !(t >= 0 && t <= 40) || !(f >= 0 && f <= 15) || !(s >= 0 && s <= 2);
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">O que o CRM não sabe (confirme com seu contador / gateway)</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="eco-tax">Imposto sobre a venda (%)</Label><Input id="eco-tax" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} disabled={!canEdit || saving} /></div>
        <div className="space-y-1"><Label htmlFor="eco-fee">Taxa média de pagamento (%)</Label><Input id="eco-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} disabled={!canEdit || saving} /></div>
        <div className="space-y-1"><Label htmlFor="eco-ship">Frete que você paga ÷ frete que cobra</Label><Input id="eco-ship" inputMode="decimal" value={ship} onChange={(e) => setShip(e.target.value)} disabled={!canEdit || saving} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Frete: 1 = você paga o mesmo que cobra do cliente; 1,2 = paga 20% a mais; 0,8 = paga 20% a menos.</p>
      <Button onClick={() => onSave({ inputs: { tax_pct: t, gateway_fee_pct: f, shipping_cost_ratio: s } })} disabled={!canEdit || saving || invalid}>{saving ? "Salvando…" : "Salvar e recalcular"}</Button>
      {invalid && <p className="text-xs text-destructive">Imposto de 0 a 40, taxa de 0 a 15, frete de 0 a 2.</p>}
      {!canEdit && <p className="text-xs text-muted-foreground">Somente administradores podem alterar.</p>}
    </div>
  );
}

/** Economia real da loja (medida nos pedidos do CRM) → ponto de equilíbrio do ROAS e metas. */
export function EconomicsCard({ eco, canEdit }: { eco: ReturnType<typeof useGoogleAdsEconomics>; canEdit: boolean }) {
  const { view, save } = eco;
  const ga4 = useGa4Monthly();
  if (view.isLoading) return <Skeleton className="h-64 w-full" />;
  if (view.error || !view.data) return <p className="text-sm text-destructive">Não foi possível calcular a economia: {(view.error as Error | null)?.message}</p>;
  const v = view.data, m = v.metrics, b = v.break_even;
  const belowFloor = b.break_even_roas_google != null && v.targets.min_roas < b.break_even_roas_google;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Calculator className="h-5 w-5" /> Economia real da loja (últimos 24 meses)</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Esta aba é opcional. O sistema funciona normalmente sem você mexer aqui: ela só mostra, com os pedidos do seu CRM, a partir de que ROAS o anúncio dá lucro, e deixa você ajustar imposto, taxas e metas.</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Ticket médio" value={reais(m.avg_ticket)} hint={`${m.avg_units ?? "—"} peças por pedido`} />
            <Stat label="Margem do produto" value={pct(m.product_margin_pct)} hint={`custo médio ${reais(m.avg_cogs)}`} />
            <Stat label="Pedidos cancelados" value={pct(m.cancel_pct)} hint={`devolvidos/chargeback: ${pct(m.refund_pct)}`} />
            <Stat label="Clientes que recompram" value={pct(m.repeat_pct)} hint={`${m.orders_valid.toLocaleString("pt-BR")} pedidos pagos`} />
          </div>

          <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-4">
            <Stat label="Lucro por R$ 100 vendidos" value={reais(b.contribution_pct)} hint="após produto, frete, taxa e imposto" />
            <Stat label="ROAS de equilíbrio (Google)" value={x(b.break_even_roas_google)} hint="abaixo disso o anúncio dá prejuízo" />
            <Stat label="Custo máximo por venda" value={reais(b.max_cpa)} />
            <Stat label="Metas atuais" value={`${x(v.targets.alert_roas)} · ${x(v.targets.min_roas)} · ${x(v.targets.target_roas)}`} hint="alerta · mínimo · alvo" />
          </div>

          {b.profit_per_ad_real_at_min != null && (
            <p className="text-sm">No ROAS mínimo de {x(v.targets.min_roas)}, cada R$ 1 em anúncio deixa cerca de <strong>{reais(b.profit_per_ad_real_at_min)}</strong> de lucro.</p>
          )}
          {belowFloor && <Alert variant="destructive"><AlertDescription>O ROAS mínimo ({x(v.targets.min_roas)}) está abaixo do ponto de equilíbrio ({x(b.break_even_roas_google)}): campanhas aceitas pelo sistema podem dar prejuízo.</AlertDescription></Alert>}
          {b.warnings.map((w) => <p key={w} className="text-sm text-amber-600 dark:text-amber-400">{w}</p>)}

          <Settings v={v} canEdit={canEdit} saving={save.isPending} onSave={(body) => save.mutate(body)} />
          <p className="text-xs text-muted-foreground">Calculado em {new Date(v.computed_at).toLocaleString("pt-BR")} a partir dos pedidos da Loja Integrada. Só leitura: nada muda no Google Ads.</p>
        </CardContent>
      </Card>
      <EconomicsRecon recon={v.reconciliation} ga4={ga4.data} />
    </div>
  );
}
