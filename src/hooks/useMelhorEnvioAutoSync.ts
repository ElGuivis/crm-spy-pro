import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { createLogger } from '@/lib/logger';
const log = createLogger('useMelhorEnvioAutoSync');
function getErrMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

interface AutoSyncConfig {
  id: string;
  integration_id: string;
  tenant_id: string;
  sync_type: string;
  is_active: boolean;
  interval_minutes: number;
  last_sync_at: string | null;
  next_sync_at: string | null;
}

export function useMelhorEnvioAutoSync(integrationId: string) {
  const [config, setConfig] = useState<AutoSyncConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('me_auto_sync_configs')
        .select('id, integration_id, tenant_id, sync_type, is_active, interval_minutes, last_sync_at, next_sync_at, created_at')
        .eq('integration_id', integrationId)
        .eq('sync_type', 'shipments')
        .maybeSingle();

      if (error) throw error;
      setConfig(data as AutoSyncConfig | null);
    } catch (err) {
      log.error('Error fetching ME auto sync config:', err);
    } finally {
      setIsLoading(false);
    }
  }, [integrationId]);

  useEffect(() => {
    if (integrationId) {
      fetchConfig();
    }
  }, [integrationId, fetchConfig]);

  // Toggle auto-sync
  const toggleAutoSync = useCallback(async (enabled: boolean) => {
    setIsSaving(true);
    try {
      if (config) {
        // Update existing
        const nextSync = enabled 
          ? new Date(Date.now() + config.interval_minutes * 60 * 1000).toISOString()
          : null;

        const { error } = await (supabase as any)
          .from('me_auto_sync_configs')
          .update({ 
            is_active: enabled,
            next_sync_at: nextSync
          })
          .eq('id', config.id);

        if (error) throw error;
        setConfig({ ...config, is_active: enabled, next_sync_at: nextSync });
      } else {
        // Create new
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('Não autenticado');

        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('owner_id', userData.user.id)
          .single();

        if (!tenant) throw new Error('Tenant não encontrado');

        const intervalMinutes = 30;
        const nextSync = enabled 
          ? new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString()
          : null;

        const { data, error } = await (supabase as any)
          .from('me_auto_sync_configs')
          .insert({
            integration_id: integrationId,
            tenant_id: tenant.id,
            sync_type: 'shipments',
            is_active: enabled,
            interval_minutes: intervalMinutes,
            next_sync_at: nextSync
          })
          .select()
          .single();

        if (error) throw error;
        setConfig(data as AutoSyncConfig);
      }

      toast({
        title: enabled ? 'Auto-sync ativado' : 'Auto-sync desativado',
        description: enabled 
          ? 'Os envios serão atualizados automaticamente.'
          : 'As atualizações automáticas foram desativadas.'
      });
    } catch (err: unknown) {
      log.error('Error toggling auto sync:', err);
      toast({
        title: 'Erro',
        description: getErrMsg(err) || 'Falha ao alterar configuração',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  }, [config, integrationId, toast]);

  // Update interval
  const updateInterval = useCallback(async (minutes: number) => {
    if (!config) return;
    
    setIsSaving(true);
    try {
      const nextSync = config.is_active
        ? new Date(Date.now() + minutes * 60 * 1000).toISOString()
        : null;

      const { error } = await (supabase as any)
        .from('me_auto_sync_configs')
        .update({ 
          interval_minutes: minutes,
          next_sync_at: nextSync
        })
        .eq('id', config.id);

      if (error) throw error;
      setConfig({ ...config, interval_minutes: minutes, next_sync_at: nextSync });

      toast({
        title: 'Intervalo atualizado',
        description: `Sync a cada ${minutes} minutos.`
      });
    } catch (err: unknown) {
      log.error('Error updating interval:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar intervalo',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  }, [config, toast]);

  // Manual trigger
  const triggerNow = useCallback(async () => {
    try {
      // Check new shipments
      const { data: checkData, error: checkError } = await supabase.functions.invoke('me-job-processor', {
        body: { action: 'check-new', integrationId }
      });

      if (checkError) throw checkError;

      // Update tracking
      const { data: trackingData, error: trackingError } = await supabase.functions.invoke('me-job-processor', {
        body: { action: 'update-tracking', integrationId }
      });

      if (trackingError) throw trackingError;

      const newCount = checkData?.newShipments || 0;
      const updatedCount = trackingData?.updated || 0;

      toast({
        title: 'Sincronização concluída',
        description: `${newCount} novo(s), ${updatedCount} atualizado(s).`
      });

      // Update last_sync_at
      if (config) {
        await (supabase as any)
          .from('me_auto_sync_configs')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', config.id);
        
        setConfig({ ...config, last_sync_at: new Date().toISOString() });
      }

      return { newShipments: newCount, updated: updatedCount };
    } catch (err: unknown) {
      log.error('Error triggering sync:', err);
      toast({
        title: 'Erro na sincronização',
        description: getErrMsg(err) || 'Falha ao sincronizar',
        variant: 'destructive'
      });
      return { newShipments: 0, updated: 0 };
    }
  }, [config, integrationId, toast]);

  return {
    config,
    isLoading,
    isSaving,
    isActive: config?.is_active || false,
    intervalMinutes: config?.interval_minutes || 30,
    lastSyncAt: config?.last_sync_at,
    nextSyncAt: config?.next_sync_at,
    toggleAutoSync,
    updateInterval,
    triggerNow,
    refetch: fetchConfig
  };
}
