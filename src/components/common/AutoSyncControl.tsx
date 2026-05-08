import { useState, useEffect, useCallback } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Clock, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { createLogger } from '@/lib/logger';
const log = createLogger('AutoSyncControl');

export type SyncType = 'orders' | 'customers' | 'products' | 'carts' | 'coupons' | 'shipments';

interface AutoSyncControlProps {
  integrationId: string;
  syncType: SyncType;
  onSyncTriggered?: () => void;
}

const INTERVAL_OPTIONS = [
  { value: '1', label: '1 min' },
  { value: '5', label: '5 min' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hora' },
];

// Field mapping for each sync type - individual columns per type
const FIELD_MAP: Record<SyncType, { enabled: string; interval: string; lastSync: string }> = {
  orders: {
    enabled: 'auto_sync_orders',
    interval: 'auto_sync_orders_interval',
    lastSync: 'last_sync_orders_at'
  },
  customers: {
    enabled: 'auto_sync_customers',
    interval: 'auto_sync_customers_interval',
    lastSync: 'last_sync_customers_at'
  },
  products: {
    enabled: 'auto_sync_products',
    interval: 'auto_sync_products_interval',
    lastSync: 'last_sync_products_at'
  },
  carts: {
    enabled: 'auto_sync_carts',
    interval: 'auto_sync_carts_interval',
    lastSync: 'last_sync_carts_at'
  },
  coupons: {
    enabled: 'auto_sync_coupons',
    interval: 'auto_sync_coupons_interval',
    lastSync: 'last_sync_coupons_at'
  },
  shipments: {
    enabled: 'auto_sync_shipments',
    interval: 'auto_sync_shipments_interval',
    lastSync: 'last_sync_shipments_at'
  },
};

export function AutoSyncControl({ integrationId, syncType, onSyncTriggered }: AutoSyncControlProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [interval, setInterval] = useState('5');
  const [lastAutoSync, setLastAutoSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [integrationType, setIntegrationType] = useState<string | null>(null);

  const fields = FIELD_MAP[syncType];

  // Load configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('integrations')
          .select(`type, ${fields.enabled}, ${fields.interval}, ${fields.lastSync}`)
          .eq('id', integrationId)
          .single();

        if (error) throw error;

        if (data) {
          const enabledValue = (data as any)[fields.enabled];
          const intervalValue = (data as any)[fields.interval];
          const lastSyncValue = (data as any)[fields.lastSync];
          
          setEnabled(enabledValue || false);
          setInterval(String(intervalValue || 5));
          setLastAutoSync(lastSyncValue);
          setIntegrationType((data as any).type || null);
        }
      } catch (error) {
        log.error('Failed to load auto-sync config:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [integrationId, fields]);

  // Countdown timer
  useEffect(() => {
    if (!enabled || !lastAutoSync) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const lastSync = new Date(lastAutoSync).getTime();
      const intervalMs = parseInt(interval) * 60 * 1000;
      const nextSync = lastSync + intervalMs;
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((nextSync - now) / 1000));
      setCountdown(remaining);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);

    return () => window.clearInterval(timer);
  }, [enabled, lastAutoSync, interval]);

  // Realtime subscription for this specific sync type
  useEffect(() => {
    const channel = supabase
      .channel(`auto-sync-${integrationId}-${syncType}`)
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
          const newLastSync = newData[fields.lastSync];
          if (newLastSync !== lastAutoSync) {
            setLastAutoSync(newLastSync);
            onSyncTriggered?.();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [integrationId, syncType, lastAutoSync, onSyncTriggered, fields.lastSync]);

  const saveConfig = useCallback(async (newEnabled: boolean, newInterval: string) => {
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        [fields.enabled]: newEnabled,
        [fields.interval]: parseInt(newInterval),
      };

      // If enabling, trigger immediate sync
      if (newEnabled) {
        updateData[fields.lastSync] = new Date().toISOString();
      }

      const { error } = await supabase
        .from('integrations')
        .update(updateData)
        .eq('id', integrationId);

      if (error) throw error;

      if (newEnabled) {
        setLastAutoSync(updateData[fields.lastSync] as string);
        
        // Trigger immediate sync - use correct function based on integration type
        const functionName = integrationType === 'bling' ? 'bling-job-processor' : 'li-reconciliation-processor';
        supabase.functions.invoke(functionName, {
          body: { integrationId, syncType, manual: true }
        }).then(() => {
          onSyncTriggered?.();
        });

        toast({
          title: 'Sincronização automática ativada',
          description: `Atualizações automáticas a cada ${newInterval} minuto(s).`
        });
      } else {
        toast({
          title: 'Sincronização automática desativada',
          description: 'As atualizações automáticas foram pausadas.'
        });
      }
    } catch (error) {
      log.error('Failed to save auto-sync config:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a configuração.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  }, [integrationId, syncType, toast, onSyncTriggered, fields]);

  const handleToggle = useCallback((checked: boolean) => {
    setEnabled(checked);
    saveConfig(checked, interval);
  }, [interval, saveConfig]);

  const handleIntervalChange = useCallback((value: string) => {
    setInterval(value);
    if (enabled) {
      saveConfig(enabled, value);
    }
  }, [enabled, saveConfig]);

  const formatCountdown = (seconds: number): string => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }
    return `${seconds}s`;
  };

  const formatLastSync = (dateStr: string | null): string => {
    if (!dateStr) return 'Nunca';
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return 'Nunca';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30 animate-pulse">
        <div className="h-4 w-4 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                enabled 
                  ? 'border-green-500/50 bg-green-500/10' 
                  : 'border-border bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {enabled ? (
                  <RefreshCw className={`h-3.5 w-3.5 text-green-500 ${saving ? 'animate-spin' : ''}`} />
                ) : (
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <Label 
                  htmlFor={`auto-sync-${integrationId}-${syncType}`}
                  className="text-xs font-medium cursor-pointer select-none whitespace-nowrap"
                >
                  Auto-sync
                </Label>
                <Switch
                  id={`auto-sync-${integrationId}-${syncType}`}
                  checked={enabled}
                  onCheckedChange={handleToggle}
                  disabled={saving}
                  className="scale-75"
                />
              </div>

              {enabled && (
                <Select 
                  value={interval} 
                  onValueChange={handleIntervalChange}
                  disabled={saving}
                >
                  <SelectTrigger className="h-6 w-16 text-xs border-0 bg-transparent p-0 pl-1 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1.5 text-xs">
              <p className="font-medium">
                {enabled ? '✓ Sincronização automática ativa' : 'Sincronização automática desativada'}
              </p>
              {enabled && (
                <>
                  <p className="text-muted-foreground">
                    Intervalo: {INTERVAL_OPTIONS.find(o => o.value === interval)?.label}
                  </p>
                  {countdown !== null && (
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Próxima: {formatCountdown(countdown)}
                    </p>
                  )}
                </>
              )}
              <p className="text-muted-foreground">
                Última: {formatLastSync(lastAutoSync)}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>

        {enabled && countdown !== null && countdown <= 30 && (
          <Badge variant="outline" className="text-xs animate-pulse border-green-500 text-green-500">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            {formatCountdown(countdown)}
          </Badge>
        )}
      </div>
    </TooltipProvider>
  );
}
