import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEmailCampaignsPerformance, pct } from '@/hooks/useEmailCampaignPerformance';
import { DollarSign, Mail, MousePointer, ShoppingCart } from 'lucide-react';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const int = (n: number) => n.toLocaleString('pt-BR');

/** Receita atribuída às campanhas de e-mail (mesma conta da aba Desempenho do E-mail Marketing: cupom > clique > abertura, um pedido conta uma vez). */
export function RFMRevenueAttribution() {
  const [lookback, setLookback] = useState(90);
  const { data, isLoading } = useEmailCampaignsPerformance();

  const since = Date.now() - lookback * 86_400_000;
  const rows = (data ?? [])
    .filter((r) => r.sent_at && new Date(r.sent_at).getTime() >= since)
    .sort((a, b) => b.revenue - a.revenue);
  const totals = rows.reduce(
    (acc, r) => ({ opens: acc.opens + r.unique_opens, clicks: acc.clicks + r.unique_clicks, orders: acc.orders + r.orders, revenue: acc.revenue + r.revenue }),
    { opens: 0, clicks: 0, orders: 0, revenue: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Receita por Campanha de E-mail
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pedidos que vieram de cada campanha, por cupom, clique ou abertura
            </p>
          </div>
          <Select value={String(lookback)} onValueChange={(v) => setLookback(Number(v))}>
            <SelectTrigger className="w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="180">Últimos 180 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-base font-semibold mb-1">Sem campanhas no período</h3>
            <p className="text-sm text-muted-foreground">Envie campanhas de e-mail para acompanhar a receita que elas geram.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { icon: Mail, label: 'Pessoas que abriram', value: int(totals.opens) },
                { icon: MousePointer, label: 'Pessoas que clicaram', value: int(totals.clicks) },
                { icon: ShoppingCart, label: 'Pedidos atribuídos', value: int(totals.orders) },
                { icon: DollarSign, label: 'Receita atribuída', value: brl(totals.revenue) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Icon className="h-3.5 w-3.5" />{label}</div>
                  <div className="font-semibold text-sm">{value}</div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead className="text-center">Enviados</TableHead>
                    <TableHead className="text-center">Abriram</TableHead>
                    <TableHead className="text-center">Clicaram</TableHead>
                    <TableHead className="text-center">Pedidos</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.campaign_id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{r.internal_name}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{int(r.total_sent)}</TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{int(r.unique_opens)}</span>
                        {r.total_sent > 0 && <span className="text-xs text-muted-foreground ml-1">({pct(r.unique_opens, r.total_sent)}%)</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{int(r.unique_clicks)}</span>
                        {r.total_sent > 0 && <span className="text-xs text-muted-foreground ml-1">({pct(r.unique_clicks, r.total_sent)}%)</span>}
                      </TableCell>
                      <TableCell className="text-center"><Badge variant="secondary" className="font-medium">{int(r.orders)}</Badge></TableCell>
                      <TableCell className="text-right font-semibold text-primary">{brl(r.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              * Cada pedido conta uma vez, para a campanha de maior prova (cupom, depois clique, depois abertura), dentro da janela de atribuição de cada campanha. Detalhes na aba Resultados do E-mail Marketing.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
