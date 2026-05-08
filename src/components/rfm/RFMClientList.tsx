import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { RFMSnapshot } from '@/hooks/useRFMData';
import { RFMClientDetailDialog, formatWhatsAppLink } from './RFMClientDetailDialog';

const segmentColors: Record<string, string> = {
  'Campeões': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'Fiéis': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'Novos Clientes': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'Promissores': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Em Risco': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Alto Valor em Risco': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'Hibernando/Perdidos': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  'Outros': 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
};

const churnColors: Record<string, string> = {
  'saudavel': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'atencao': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'risco': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'critico': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const churnLabels: Record<string, string> = {
  'saudavel': 'Saudável',
  'atencao': 'Atenção',
  'risco': 'Risco',
  'critico': 'Crítico',
};

interface RFMClientListProps {
  snapshots: RFMSnapshot[];
  segmentFilter: string | null;
  onSegmentFilterChange: (segment: string | null) => void;
  allSegments: string[];
}

export function RFMClientList({ snapshots, segmentFilter, onSegmentFilterChange, allSegments }: RFMClientListProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedClient, setSelectedClient] = useState<RFMSnapshot | null>(null);
  const pageSize = 20;

  const filtered = snapshots.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.customer_name?.toLowerCase().includes(q) ||
      s.customer_email?.toLowerCase().includes(q) ||
      s.customer_phone?.includes(q) ||
      s.customer_doc?.includes(q)
    );
  });

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Clientes ({filtered.length})</CardTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge
              variant={segmentFilter === null ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => onSegmentFilterChange(null)}
            >
              Todos
            </Badge>
            {allSegments.map(seg => (
              <Badge
                key={seg}
                variant={segmentFilter === seg ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => onSegmentFilterChange(seg === segmentFilter ? null : seg)}
              >
                {seg}
              </Badge>
            ))}
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, telefone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Último Pedido</TableHead>
                  <TableHead className="text-right">Total Gasto</TableHead>
                  <TableHead className="text-center">Score RFM</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Risco Churn</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map(s => {
                  const waLink = formatWhatsAppLink(s.customer_phone, s.customer_name, s.segment_name);
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedClient(s)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{s.customer_name || '—'}</p>
                          <p className="text-xs text-muted-foreground">{s.customer_email || ''}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{s.customer_phone || '—'}</TableCell>
                      <TableCell className="text-sm">
                        {s.last_order_date ? format(new Date(s.last_order_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        R$ {Number(s.revenue_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono font-bold">{s.rfm_score || '—'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={segmentColors[s.segment_name || 'Outros'] || segmentColors['Outros']} variant="secondary">
                          {s.segment_name || 'Outros'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={churnColors[s.churn_risk || 'saudavel'] || churnColors['saudavel']} variant="secondary">
                          {churnLabels[s.churn_risk || 'saudavel'] || s.churn_risk}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {waLink && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(waLink, '_blank');
                            }}
                            title="Enviar WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {paginated.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum cliente encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Página {page + 1} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 text-sm rounded border disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 text-sm rounded border disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <RFMClientDetailDialog
        snapshot={selectedClient}
        open={!!selectedClient}
        onOpenChange={(open) => { if (!open) setSelectedClient(null); }}
      />
    </>
  );
}
