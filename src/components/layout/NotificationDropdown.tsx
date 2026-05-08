import { useState, useEffect } from 'react';
import { Bell, ShoppingCart, AlertTriangle, RefreshCw, Package, CheckCheck, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useNewOrders } from '@/contexts/NewOrdersContext';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { createLogger } from '@/lib/logger';
const log = createLogger('NotificationDropdown');

interface NotificationItem {
  id: string;
  type: 'new_order' | 'sync_error' | 'low_stock' | 'rfm_alert';
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  link?: string;
  icon: 'cart' | 'alert' | 'sync' | 'package' | 'rfm';
}

export function NotificationDropdown() {
  const { newOrdersCount, markAllAsSeen } = useNewOrders();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const items: NotificationItem[] = [];

      // 1. Recent orders (last 5)
      const { data: recentOrders } = await supabase
        .from('li_orders')
        .select('id, order_number, raw_json, totals_json, updated_at_local, integration_id')
        .order('updated_at_local', { ascending: false })
        .limit(5);

      if (recentOrders) {
        for (const order of recentOrders) {
          const raw = (order.raw_json || {}) as any;
          const totals = (order.totals_json || {}) as any;
          const total = totals.total ? `R$ ${Number(totals.total).toFixed(2)}` : '';
          items.push({
            id: `order-${order.id}`,
            type: 'new_order',
            title: `Pedido #${order.order_number || 'N/A'}`,
            description: `${raw.cliente_nome || 'Cliente'} ${total ? '• ' + total : ''}`,
            timestamp: order.updated_at_local || '',
            read: false,
            link: `/sales/${order.integration_id}`,
            icon: 'cart',
          });
        }
      }


      // 2. Failed syncs (use bling_sync_logs as a proxy since li_sync_logs has type issues)
      const { data: failedSyncs } = await supabase
        .from('bling_sync_logs')
        .select('id, sync_type, error_message, started_at, integration_id')
        .eq('status', 'failed')
        .order('started_at', { ascending: false })
        .limit(3);

      if (failedSyncs) {
        for (const sync of failedSyncs) {
          const typeMap: Record<string, string> = {
            orders: 'Pedidos',
            customers: 'Clientes',
            products: 'Produtos',
          };
          items.push({
            id: `sync-${sync.id}`,
            type: 'sync_error',
            title: `Falha na sincronização`,
            description: `${typeMap[sync.sync_type] || sync.sync_type} • ${sync.error_message?.substring(0, 60) || 'Erro desconhecido'}`,
            timestamp: sync.started_at || '',
            read: false,
            link: '/integrations',
            icon: 'sync',
          });
        }
      }

      // 4. RFM alerts (unread, last 7 days)
      const { data: rfmAlerts } = await supabase
        .from('rfm_alerts')
        .select('id, alert_type, title, description, severity, created_at, integration_id, is_read')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (rfmAlerts) {
        for (const alert of rfmAlerts) {
          items.push({
            id: `rfm-${alert.id}`,
            type: 'rfm_alert',
            title: (alert as any).title || 'Alerta RFM',
            description: (alert as any).description || '',
            timestamp: alert.created_at || '',
            read: (alert as any).is_read || false,
            link: '/rfm',
            icon: 'rfm',
          });
        }
      }

      // 5. Low stock products (stock <= 2, only parents)
      const { data: lowStock } = await supabase
        .from('li_products')
        .select('id, name, sku, raw_json, integration_id')
        .eq('active', true)
        .lte('stock', 2)
        .order('name', { ascending: true })
        .limit(3);

      if (lowStock) {
        for (const product of lowStock) {
          const raw = (product.raw_json || {}) as any;
          if (raw.tipo === 'atributo_opcao') continue;
          const qty = raw.estoque_quantidade ?? 0;
          if (qty > 2) continue;
          items.push({
            id: `stock-${product.id}`,
            type: 'low_stock',
            title: 'Estoque baixo',
            description: `${product.name?.substring(0, 40)} • ${qty} un.`,
            timestamp: '',
            read: false,
            link: `/products/${product.integration_id}`,
            icon: 'package',
          });
        }
      }

      // Sort by timestamp desc
      items.sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

      setNotifications(items);
    } catch (err) {
      log.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open]);

  const iconMap = {
    cart: ShoppingCart,
    alert: AlertTriangle,
    sync: RefreshCw,
    package: Package,
    rfm: TrendingDown,
  };

  const iconColorMap = {
    cart: 'text-primary',
    alert: 'text-yellow-500',
    sync: 'text-destructive',
    package: 'text-orange-500',
    rfm: 'text-purple-500',
  };

  const totalCount = newOrdersCount + notifications.filter(n => n.type !== 'new_order').length;

  const handleClickNotification = (n: NotificationItem) => {
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  const handleMarkAllRead = () => {
    markAllAsSeen();
    setOpen(false);
  };

  const formatTime = (ts: string) => {
    if (!ts) return '';
    try {
      return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: ptBR });
    } catch {
      return '';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {newOrdersCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {newOrdersCount > 9 ? '9+' : newOrdersCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 p-0 bg-popover border border-border shadow-lg z-50"
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm text-foreground">Notificações</h3>
          {newOrdersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar como lidas
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação no momento
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = iconMap[n.icon];
                const iconColor = iconColorMap[n.icon];
                return (
                  <button
                    key={n.id}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => handleClickNotification(n)}
                  >
                    <div className={`mt-0.5 flex-shrink-0 rounded-full p-1.5 bg-muted ${iconColor}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{n.description}</p>
                      {n.timestamp && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">{formatTime(n.timestamp)}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className="flex-shrink-0 text-[10px] mt-0.5"
                    >
                      {n.type === 'new_order' && 'Pedido'}
                      {n.type === 'sync_error' && 'Erro'}
                      {n.type === 'low_stock' && 'Estoque'}
                      {n.type === 'rfm_alert' && 'RFM'}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
