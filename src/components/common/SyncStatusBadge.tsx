import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type SyncType = 'orders' | 'customers' | 'products' | 'carts' | 'coupons' | 'shipments';

interface SyncStatusBadgeProps {
  integrationId: string;
  syncType: SyncType;
}

const FIELD_MAP: Record<SyncType, string> = {
  orders: 'last_sync_orders_at',
  customers: 'last_sync_customers_at',
  products: 'last_sync_products_at',
  carts: 'last_sync_carts_at',
  coupons: 'last_sync_coupons_at',
  shipments: 'last_sync_shipments_at',
};

const LABEL_MAP: Record<SyncType, string> = {
  orders: 'pedidos',
  customers: 'clientes',
  products: 'produtos',
  carts: 'carrinhos',
  coupons: 'cupons',
  shipments: 'envios',
};

export function SyncStatusBadge({ integrationId, syncType }: SyncStatusBadgeProps) {
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const field = FIELD_MAP[syncType];

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('integrations')
        .select(`${field}, last_sync_at`)
        .eq('id', integrationId)
        .single();

      if (data) {
        setLastSync((data as any)[field] || (data as any).last_sync_at || null);
      }
      setLoading(false);
    };

    load();
  }, [integrationId, field]);

  // Listen for realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`sync-status-${integrationId}-${syncType}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'integrations',
          filter: `id=eq.${integrationId}`
        },
        (payload) => {
          const newData = payload.new as any;
          const newLastSync = newData[field] || newData.last_sync_at;
          if (newLastSync) {
            setLastSync(newLastSync);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [integrationId, syncType, field]);

  const formatLastSync = (dateStr: string | null): string => {
    if (!dateStr) return 'Nunca sincronizado';
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return 'Nunca';
    }
  };

  if (loading) {
    return (
      <Badge variant="outline" className="gap-1.5 text-xs animate-pulse">
        <RefreshCw className="h-3 w-3" />
        Carregando...
      </Badge>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="gap-1.5 text-xs border-green-500/50 text-green-600 bg-green-500/10"
          >
            <CheckCircle2 className="h-3 w-3" />
            Auto-sync ativo
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              Sincronização automática de {LABEL_MAP[syncType]}
            </p>
            <p className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Última sync: {formatLastSync(lastSync)}
            </p>
            <p className="text-muted-foreground">
              O sistema verifica automaticamente por novos dados a cada poucos minutos.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
