import { Badge } from '@/components/ui/badge';
import { Clock, Package, Truck, CheckCircle2, XCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MelhorEnvioShipment } from '@/hooks/useMelhorEnvio';

export const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pending:    { label: 'Pendente',    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  posted:     { label: 'Postado',     color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',         icon: Package },
  in_transit: { label: 'Em Trânsito', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: Truck },
  delivered:  { label: 'Entregue',    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',     icon: CheckCircle2 },
  canceled:   { label: 'Cancelado',   color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',             icon: XCircle },
  expired:    { label: 'Expirado',    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',         icon: AlertCircle },
  returning:  { label: 'Retornando',  color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: RotateCcw },
  returned:   { label: 'Devolvido',   color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: RotateCcw },
};

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try { return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); }
  catch { return '-'; }
}

export function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try { return format(new Date(dateStr), "dd/MM/yy", { locale: ptBR }); }
  catch { return '-'; }
}

export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function getStatusBadge(status: string | null) {
  const config = statusConfig[status || 'pending'] || statusConfig.pending;
  const Icon = config.icon;
  return (
    <Badge className={`${config.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export function getDaysLate(shipment: MelhorEnvioShipment): number {
  if (!shipment.estimated_delivery_at) return 0;
  const estimated = new Date(shipment.estimated_delivery_at);
  const now = new Date();
  return Math.max(0, Math.ceil((now.getTime() - estimated.getTime()) / (1000 * 60 * 60 * 24)));
}

export function getDaysLateBadge(daysLate: number) {
  if (daysLate <= 3) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">{daysLate} dias</Badge>;
  if (daysLate <= 7) return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">{daysLate} dias</Badge>;
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{daysLate} dias</Badge>;
}

export function getCardFilterLabel(filter: string): string {
  const labels: Record<string, string> = {
    pending: 'Pendentes', posted: 'Postados', in_transit: 'Em Trânsito',
    delivered: 'Entregues', canceled: 'Cancelados', delayed: 'Atrasados',
  };
  return labels[filter] || filter;
}
