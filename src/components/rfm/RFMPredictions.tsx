import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, ChevronLeft, ChevronRight, TrendingUp, CalendarClock, Target } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { RFMSnapshot } from '@/hooks/useRFMData';
import { cn } from '@/lib/utils';

interface RFMPredictionsProps {
  snapshots: RFMSnapshot[];
}

const PAGE_SIZE = 15;

function getProbColor(prob: number | null): string {
  if (!prob) return '';
  if (prob >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (prob >= 40) return 'text-yellow-600 dark:text-yellow-400';
  if (prob >= 20) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function getWindowBadge(start: number | null, end: number | null): string | null {
  if (start === null || end === null) return null;
  if (start === 0 && end <= 7) return 'Agora!';
  if (start <= 3) return `Em ${end} dias`;
  return `${start}-${end} dias`;
}

export function RFMPredictions({ snapshots }: RFMPredictionsProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<'probability' | 'date' | 'revenue'>('probability');

  // Only show customers with predictions
  const withPredictions = useMemo(() => {
    return snapshots.filter(s =>
      (s as any).predicted_next_purchase_date != null &&
      (s as any).purchase_probability_30d != null
    );
  }, [snapshots]);

  const filtered = useMemo(() => {
    let result = withPredictions;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        (s.customer_name || '').toLowerCase().includes(q) ||
        (s.customer_email || '').toLowerCase().includes(q) ||
        (s.customer_phone || '').includes(q)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      const aSnap = a as any;
      const bSnap = b as any;
      if (sortBy === 'probability') return (bSnap.purchase_probability_30d || 0) - (aSnap.purchase_probability_30d || 0);
      if (sortBy === 'date') return (aSnap.predicted_next_purchase_date || '').localeCompare(bSnap.predicted_next_purchase_date || '');
      return (b.revenue_total || 0) - (a.revenue_total || 0);
    });
    return result;
  }, [withPredictions, search, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Summary stats
  const highProb = withPredictions.filter(s => ((s as any).purchase_probability_30d || 0) >= 60).length;
  const upcoming7d = withPredictions.filter(s => {
    const pred = (s as any).predicted_next_purchase_date;
    if (!pred) return false;
    const days = differenceInDays(new Date(pred), new Date());
    return days >= 0 && days <= 7;
  }).length;
  const avgProb30 = withPredictions.length > 0
    ? withPredictions.reduce((sum, s) => sum + ((s as any).purchase_probability_30d || 0), 0) / withPredictions.length
    : 0;

  if (withPredictions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold mb-1">Sem dados preditivos</h3>
          <p className="text-sm text-muted-foreground">
            Recalcule o RFM para gerar previsões. Clientes precisam de pelo menos 2 compras para previsão.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alta Probabilidade (30d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{highProb}</div>
            <p className="text-xs text-muted-foreground">clientes com ≥60% chance</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Compra Prevista em 7 dias</CardTitle>
            <CalendarClock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcoming7d}</div>
            <p className="text-xs text-muted-foreground">previstos para esta semana</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Probabilidade Média (30d)</CardTitle>
            <Target className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgProb30.toFixed(1)}%</div>
            <Progress value={avgProb30} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-lg">Previsão de Recompra ({filtered.length})</CardTitle>
            <div className="flex gap-2">
              <div className="relative w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={sortBy} onValueChange={(v: any) => { setSortBy(v); setPage(0); }}>
                <SelectTrigger className="w-44 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="probability">Maior probabilidade</SelectItem>
                  <SelectItem value="date">Data prevista</SelectItem>
                  <SelectItem value="revenue">Maior receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-center">Segmento</TableHead>
                  <TableHead className="text-center">Previsão</TableHead>
                  <TableHead className="text-center">7d</TableHead>
                  <TableHead className="text-center">15d</TableHead>
                  <TableHead className="text-center">30d</TableHead>
                  <TableHead className="text-center">Janela Ideal</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map(s => {
                  const snap = s as any;
                  const predDate = snap.predicted_next_purchase_date;
                  const daysUntil = predDate ? differenceInDays(new Date(predDate), new Date()) : null;
                  const windowBadge = getWindowBadge(snap.ideal_offer_window_start, snap.ideal_offer_window_end);

                  return (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-[180px]">
                        <div className="font-medium truncate">{s.customer_name || s.customer_id}</div>
                        {s.customer_phone && (
                          <div className="text-xs text-muted-foreground">{s.customer_phone}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">{s.segment_name}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="text-sm font-medium">
                              {predDate ? format(new Date(predDate), 'dd/MM/yy', { locale: ptBR }) : '—'}
                            </div>
                            {daysUntil !== null && (
                              <div className={cn('text-xs', daysUntil <= 0 ? 'text-red-500' : daysUntil <= 7 ? 'text-orange-500' : 'text-muted-foreground')}>
                                {daysUntil <= 0 ? `${Math.abs(daysUntil)}d atrasado` : `em ${daysUntil}d`}
                              </div>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Baseado no intervalo médio de {snap.avg_order_interval_days?.toFixed(0) || '?'} dias entre compras</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className={cn('text-center font-medium', getProbColor(snap.purchase_probability_7d))}>
                        {snap.purchase_probability_7d != null ? `${snap.purchase_probability_7d}%` : '—'}
                      </TableCell>
                      <TableCell className={cn('text-center font-medium', getProbColor(snap.purchase_probability_15d))}>
                        {snap.purchase_probability_15d != null ? `${snap.purchase_probability_15d}%` : '—'}
                      </TableCell>
                      <TableCell className={cn('text-center font-medium', getProbColor(snap.purchase_probability_30d))}>
                        {snap.purchase_probability_30d != null ? `${snap.purchase_probability_30d}%` : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {windowBadge ? (
                          <Badge
                            variant={snap.ideal_offer_window_start === 0 ? 'default' : 'outline'}
                            className="text-xs"
                          >
                            {windowBadge}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        R$ {Number(s.revenue_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {paged.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum cliente encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
