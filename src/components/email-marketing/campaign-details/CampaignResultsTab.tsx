import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Send, Eye, MousePointerClick, ShoppingCart, Wallet, Receipt, Percent, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MetricCard } from "./MetricCard";
import { CampaignExportCard } from "./CampaignExportCard";
import { useCampaignResults, ATTRIBUTION_LABELS, pct, type CampaignPerformance } from "@/hooks/useEmailCampaignPerformance";

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PLATFORM_LABELS: Record<string, string> = {
  loja_integrada: "Loja Integrada",
  bling: "Bling",
  nuvemshop: "Nuvemshop",
};

const fmtDate = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—");

function Funnel({ p }: { p: CampaignPerformance }) {
  const base = p.total_delivered || p.total_sent;
  const ticket = p.orders > 0 ? p.revenue / p.orders : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Enviados" value={p.total_sent} icon={Send} description={`${p.total_delivered} entregues`} />
        <MetricCard title="Abriram" value={p.unique_opens} icon={Eye} variant="success"
          description={`${pct(p.unique_opens, base)}% das entregas`} />
        <MetricCard title="Clicaram" value={p.unique_clicks} icon={MousePointerClick} variant="success"
          description={`${pct(p.unique_clicks, base)}% das entregas`} />
        <MetricCard title="Compraram" value={p.orders} icon={ShoppingCart} variant="success"
          description={`${pct(p.orders, p.total_sent)}% dos enviados`} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Receita atribuída" value={brl(p.revenue)} icon={Wallet} variant="success" />
        <MetricCard title="Ticket médio" value={brl(ticket)} icon={Receipt} />
        <MetricCard title="Compra por clique" value={`${pct(p.orders, p.unique_clicks)}%`} icon={Percent}
          description="pedidos ÷ pessoas que clicaram" />
      </div>
    </div>
  );
}

function Origins({ p }: { p: CampaignPerformance }) {
  const rows = [
    { key: "coupon", orders: p.orders_coupon, revenue: p.revenue_coupon, hint: "usaram o cupom da campanha" },
    { key: "click", orders: p.orders_click, revenue: p.revenue_click, hint: "compraram depois de clicar num link" },
    { key: "open", orders: p.orders_open, revenue: p.revenue_open, hint: "compraram depois de abrir, sem clicar" },
  ];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">De onde vieram as compras</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <div>
              <span className="font-medium">{ATTRIBUTION_LABELS[r.key]}</span>
              <span className="text-xs text-muted-foreground"> — {r.hint}</span>
            </div>
            <div className="text-right whitespace-nowrap">
              <span className="font-semibold">{r.orders}</span>
              <span className="text-muted-foreground"> pedido(s) · {brl(r.revenue)}</span>
            </div>
          </div>
        ))}
        <p className="flex gap-1.5 pt-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Cada pedido conta uma vez só. Vale compra feita até {p.window_days} dia(s) depois do contato com o e-mail
          {p.coupon_codes.length > 0 ? ` ou com o cupom ${p.coupon_codes.join(", ")}` : ""}.
          Aberturas são aproximadas: Apple Mail e Gmail podem abrir o e-mail automaticamente; o clique é o dado mais confiável.
        </p>
      </CardContent>
    </Card>
  );
}

export function CampaignResultsTab({ campaignId }: { campaignId: string }) {
  const { data, isLoading, error } = useCampaignResults(campaignId);
  const p = data?.performance;

  return (
    <TabsContent value="resultados" className="flex-1 overflow-y-auto mt-4 space-y-6">
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : error || !p ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar os resultados desta campanha.</p>
      ) : (
        <>
          <Funnel p={p} />
          <Origins p={p} />
          <CampaignExportCard campaignId={campaignId} campaignName={p.internal_name} counts={{ opened: p.unique_opens, clicked: p.unique_clicks, purchased: p.orders }} />

          {data!.links.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Links mais clicados</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Link</TableHead><TableHead className="text-right">Pessoas</TableHead><TableHead className="text-right">Cliques</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.links.map((l) => (
                      <TableRow key={l.link_url}>
                        <TableCell className="max-w-[420px] truncate" title={l.link_url}>{l.link_url}</TableCell>
                        <TableCell className="text-right">{l.unique_clickers}</TableCell>
                        <TableCell className="text-right">{l.clicks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pedidos atribuídos ({data!.conversions.length})</CardTitle></CardHeader>
            <CardContent>
              {data!.conversions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma compra atribuída ainda. Os números se atualizam a cada 15 minutos.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Data</TableHead>
                      <TableHead>Origem</TableHead><TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.conversions.map((c) => (
                      <TableRow key={`${c.platform}-${c.order_id}`}>
                        <TableCell>
                          <span className="font-medium">#{c.order_number ?? "—"}</span>
                          <span className="block text-xs text-muted-foreground">{PLATFORM_LABELS[c.platform] ?? c.platform}</span>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">{c.customer_email}</TableCell>
                        <TableCell>{fmtDate(c.ordered_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{ATTRIBUTION_LABELS[c.attribution_type]}</Badge>
                          {c.coupon_code && <span className="ml-1.5 text-xs text-muted-foreground">{c.coupon_code}</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium">{brl(c.order_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </TabsContent>
  );
}
