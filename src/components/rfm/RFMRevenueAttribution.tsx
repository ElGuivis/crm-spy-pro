import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRevenueAttribution } from '@/hooks/useRevenueAttribution';
import { DollarSign, Mail, MousePointer, Users } from 'lucide-react';

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(part: number, total: number) {
  if (!total) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

export function RFMRevenueAttribution() {
  const [lookback, setLookback] = useState(90);
  const { data, isLoading } = useRevenueAttribution(lookback);

  const rows = data || [];
  const totals = rows.reduce(
    (acc, r) => ({
      opens: acc.opens + r.opens,
      clicks: acc.clicks + r.clicks,
      customers: acc.customers + r.attributed_customers,
      revenue: acc.revenue + r.attributed_revenue,
    }),
    { opens: 0, clicks: 0, customers: 0, revenue: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Atribuição de Receita por Campanha
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Receita total dos clientes que abriram ou clicaram em cada campanha
            </p>
          </div>
          <Select value={String(lookback)} onValueChange={(v) => setLookback(Number(v))}>
            <SelectTrigger className="w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
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
            <h3 className="text-base font-semibold mb-1">Sem dados de atribuição</h3>
            <p className="text-sm text-muted-foreground">
              Envie campanhas de e-mail para visualizar a receita influenciada.
            </p>
          </div>
        ) : (
          <>
            {/* Summary chips */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { icon: Mail, label: 'Aberturas', value: totals.opens.toLocaleString('pt-BR') },
                { icon: MousePointer, label: 'Cliques', value: totals.clicks.toLocaleString('pt-BR') },
                { icon: Users, label: 'Clientes engajados', value: totals.customers.toLocaleString('pt-BR') },
                { icon: DollarSign, label: 'Receita influenciada', value: `R$ ${fmt(totals.revenue)}` },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>
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
                    <TableHead className="text-center">Aberturas</TableHead>
                    <TableHead className="text-center">Cliques</TableHead>
                    <TableHead className="text-center">Clientes</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.campaign_id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{r.campaign_name}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{r.sent_count.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{r.opens.toLocaleString('pt-BR')}</span>
                        {r.sent_count > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({pct(r.opens, r.sent_count)})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{r.clicks.toLocaleString('pt-BR')}</span>
                        {r.opens > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({pct(r.clicks, r.opens)})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-medium">
                          {r.attributed_customers.toLocaleString('pt-BR')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        R$ {fmt(r.attributed_revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              * Receita total do histórico de compras dos clientes que interagiram com a campanha — não representa receita diretamente gerada pelo e-mail.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
