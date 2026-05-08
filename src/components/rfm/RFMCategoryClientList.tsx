import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { RFMCategorySnapshot } from '@/hooks/useRFMCategoryData';

interface RFMCategoryClientListProps {
  snapshots: RFMCategorySnapshot[];
  segmentFilter: string | null;
  onSegmentFilterChange: (seg: string | null) => void;
  allSegments: string[];
}

const PAGE_SIZE = 20;

export function RFMCategoryClientList({
  snapshots,
  segmentFilter,
  onSegmentFilterChange,
  allSegments,
}: RFMCategoryClientListProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let result = snapshots;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        (s.customer_name || '').toLowerCase().includes(q) ||
        s.customer_id.toLowerCase().includes(q)
      );
    }
    return result;
  }, [snapshots, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg">Clientes na Categoria ({filtered.length})</CardTitle>
          <div className="flex gap-2">
            <div className="relative w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="pl-9 h-9"
              />
            </div>
            <Select
              value={segmentFilter || 'all'}
              onValueChange={v => { onSegmentFilterChange(v === 'all' ? null : v); setPage(0); }}
            >
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Segmento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {allSegments.map(seg => (
                  <SelectItem key={seg} value={seg}>{seg}</SelectItem>
                ))}
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
                <TableHead className="text-center">R</TableHead>
                <TableHead className="text-center">F</TableHead>
                <TableHead className="text-center">M</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Ticket Médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {s.customer_name || s.customer_id}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">{s.r_score}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">{s.f_score}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">{s.m_score}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{s.segment_name}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{s.orders_count}</TableCell>
                  <TableCell className="text-right">
                    R$ {Number(s.revenue_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {Number(s.aov || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
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
  );
}
