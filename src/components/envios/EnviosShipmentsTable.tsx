import { Button } from '@/components/ui/button';
import { RefreshCw, Package, ExternalLink, MessageSquare, Eye, MoreHorizontal } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MelhorEnvioShipment } from '@/hooks/useMelhorEnvio';
import { getStatusBadge, getDaysLate, getDaysLateBadge, formatCurrency, formatShortDate } from './envios-helpers';

interface Props {
  shipments: MelhorEnvioShipment[];
  activeTab: string;
  isLoading: boolean;
  isUpdatingShipment: boolean;
  search: string;
  statusFilter: string;
  carrierFilter: string;
  onRowClick: (shipment: MelhorEnvioShipment) => void;
  onUpdateSingle: (id: string) => void;
}

export function EnviosShipmentsTable({
  shipments, activeTab, isLoading, isUpdatingShipment,
  search, statusFilter, carrierFilter, onRowClick, onUpdateSingle,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (shipments.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium">
          {activeTab === 'delayed' ? 'Nenhum envio atrasado' : 'Nenhum envio encontrado'}
        </h3>
        <p className="text-muted-foreground">
          {activeTab === 'delayed'
            ? 'Não há envios com previsão de entrega expirada'
            : search || statusFilter !== 'all' || carrierFilter !== 'all'
              ? 'Tente ajustar os filtros de busca'
              : 'Clique em "Sincronizar Tudo" para buscar seus envios'}
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rastreio</TableHead>
          <TableHead>Pedido</TableHead>
          <TableHead>Destinatário</TableHead>
          <TableHead>Transportadora</TableHead>
          {activeTab === 'delayed' && <TableHead>Previsão</TableHead>}
          {activeTab === 'delayed' && <TableHead>Atraso</TableHead>}
          <TableHead>Status</TableHead>
          {activeTab === 'all' && <TableHead className="text-right">Valor</TableHead>}
          {activeTab === 'all' && <TableHead>Data</TableHead>}
          {activeTab === 'delayed' && <TableHead className="text-right">Ações</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {shipments.map((shipment) => (
          <TableRow key={shipment.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onRowClick(shipment)}>
            <TableCell className="font-mono text-sm">
              {shipment.tracking_code || shipment.protocol || '-'}
            </TableCell>
            <TableCell>
              {shipment.external_order_number ? (
                <span className="font-medium text-primary">#{shipment.external_order_number}</span>
              ) : shipment.order_number ? `#${shipment.order_number}` : '-'}
            </TableCell>
            <TableCell>
              <div>
                <div className="font-medium truncate max-w-[150px]">{shipment.receiver_name || '-'}</div>
                {shipment.receiver_city && shipment.receiver_state && (
                  <div className="text-xs text-muted-foreground">{shipment.receiver_city}/{shipment.receiver_state}</div>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div>
                <div className="font-medium">{shipment.carrier || '-'}</div>
                <div className="text-xs text-muted-foreground">{shipment.service_name}</div>
              </div>
            </TableCell>
            {activeTab === 'delayed' && (
              <TableCell className="text-sm text-destructive font-medium">
                {formatShortDate(shipment.estimated_delivery_at)}
              </TableCell>
            )}
            {activeTab === 'delayed' && (
              <TableCell>{getDaysLateBadge(getDaysLate(shipment))}</TableCell>
            )}
            <TableCell>{getStatusBadge(shipment.status)}</TableCell>
            {activeTab === 'all' && (
              <TableCell className="text-right font-medium">{formatCurrency(shipment.price)}</TableCell>
            )}
            {activeTab === 'all' && (
              <TableCell className="text-sm text-muted-foreground">{formatShortDate(shipment.generated_at)}</TableCell>
            )}
            {activeTab === 'delayed' && (
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open('https://melhorenvio.com.br/painel/etiquetas', '_blank'); }}>
                      <ExternalLink className="h-4 w-4 mr-2" />Ver no Melhor Envio
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateSingle(shipment.id); }} disabled={isUpdatingShipment}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${isUpdatingShipment ? 'animate-spin' : ''}`} />Atualizar Rastreio
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open('https://centraldeajuda.melhorenvio.com.br/hc/pt-br/requests/new', '_blank'); }}>
                      <MessageSquare className="h-4 w-4 mr-2" />Abrir Chamado
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRowClick(shipment); }}>
                      <Eye className="h-4 w-4 mr-2" />Ver Detalhes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
