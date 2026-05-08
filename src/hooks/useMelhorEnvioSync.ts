import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { createLogger } from '@/lib/logger';
const log = createLogger('useMelhorEnvioSync');
function getErrMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

interface MeSyncJob {
  id: string;
  tenant_id: string;
  integration_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_page: number;
  total_pages: number | null;
  items_saved: number;
  items_total: number | null;
  items_linked: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface SyncProgress {
  status: 'idle' | 'syncing' | 'completed' | 'failed' | 'cancelled';
  currentPage: number;
  totalPages: number | null;
  itemsSaved: number;
  itemsTotal: number | null;
  itemsLinked: number;
  errorMessage: string | null;
}

export function useMelhorEnvioSync(integrationId?: string) {
  const [syncJob, setSyncJob] = useState<MeSyncJob | null>(null);
  const [progress, setProgress] = useState<SyncProgress>({
    status: 'idle',
    currentPage: 0,
    totalPages: null,
    itemsSaved: 0,
    itemsTotal: null,
    itemsLinked: 0,
    errorMessage: null
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const cancelledRef = useRef(false);
  const retryCountRef = useRef(0);
  const { toast } = useToast();

  // Verificar se há job ativo ao montar
  useEffect(() => {
    const checkActiveJob = async () => {
      const { data } = await supabase
        .from('me_sync_jobs')
        .select('id, integration_id, tenant_id, status, current_page, total_pages, items_saved, items_linked, items_total, started_at, completed_at, error_message, cursor_data, created_at, updated_at')
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        // Verificar se job está travado (mais de 10 min sem atualização)
        const updatedAt = new Date(data.updated_at).getTime();
        const now = Date.now();
        const isStuck = now - updatedAt > 10 * 60 * 1000;

        if (isStuck) {
          // Reset stuck job via server-side function
          await supabase.functions.invoke('manage-sync-jobs', {
            body: { action: 'cancel-me', job_id: data.id },
          });
          return;
        }

        setSyncJob(data as unknown as MeSyncJob);
        setIsSyncing(true);
        setProgress({
          status: 'syncing',
          currentPage: data.current_page || 0,
          totalPages: data.total_pages,
          itemsSaved: data.items_saved || 0,
          itemsTotal: data.items_total,
          itemsLinked: data.items_linked || 0,
          errorMessage: null
        });
      }
    };

    checkActiveJob();
  }, [integrationId]);

  // Subscription Realtime para acompanhar progresso
  useEffect(() => {
    const channel = supabase
      .channel('me-sync-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'me_sync_jobs'
        },
        (payload) => {
          const newData = payload.new as unknown as MeSyncJob;
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setSyncJob(newData);
            
            if (newData.status === 'running' || newData.status === 'pending') {
              setIsSyncing(true);
              setProgress({
                status: 'syncing',
                currentPage: newData.current_page || 0,
                totalPages: newData.total_pages,
                itemsSaved: newData.items_saved || 0,
                itemsTotal: newData.items_total,
                itemsLinked: newData.items_linked || 0,
                errorMessage: null
              });
            } else if (newData.status === 'completed') {
              setIsSyncing(false);
              retryCountRef.current = 0;
              setProgress({
                status: 'completed',
                currentPage: newData.current_page || 0,
                totalPages: newData.total_pages,
                itemsSaved: newData.items_saved || 0,
                itemsTotal: newData.items_total,
                itemsLinked: newData.items_linked || 0,
                errorMessage: null
              });
            } else if (newData.status === 'failed') {
              setIsSyncing(false);
              setProgress({
                status: 'failed',
                currentPage: newData.current_page || 0,
                totalPages: newData.total_pages,
                itemsSaved: newData.items_saved || 0,
                itemsTotal: newData.items_total,
                itemsLinked: newData.items_linked || 0,
                errorMessage: newData.error_message
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [integrationId]);

  const startSync = useCallback(async (forceReset = false) => {
    cancelledRef.current = false;
    retryCountRef.current = 0;
    setIsSyncing(true);
    setProgress({
      status: 'syncing',
      currentPage: 0,
      totalPages: null,
      itemsSaved: 0,
      itemsTotal: null,
      itemsLinked: 0,
      errorMessage: null
    });

    try {
      let done = false;
      let lastResult: any = null;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 15;
      const MAX_TOTAL_RETRIES = 500;
      const MAX_TOTAL_TIME_MS = 60 * 60 * 1000; // 60 min hard limit
      const INVOKE_TIMEOUT_MS = 65000; // 65s timeout para fetch (edge function responde em ~50s)
      const startTime = Date.now();

      while (!done && !cancelledRef.current) {
        if (Date.now() - startTime > MAX_TOTAL_TIME_MS) {
          log.info('[useMelhorEnvioSync] Limite de 60min atingido');
          toast({
            title: 'Sincronização parcial',
            description: 'Limite de tempo atingido. Execute novamente para continuar de onde parou.',
          });
          done = true;
          break;
        }

        try {
          // Use AbortController for fetch timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);

          const { data, error } = await supabase.functions.invoke('melhor-envio', {
            body: { 
              action: 'sync_shipments',
              force_reset: forceReset && retryCountRef.current === 0 
            }
          });

          clearTimeout(timeoutId);

          if (cancelledRef.current) {
            setProgress(prev => ({
              ...prev,
              status: 'cancelled',
              errorMessage: 'Sincronização cancelada'
            }));
            return { success: false, cancelled: true };
          }

          if (error) {
            throw new Error(getErrMsg(error) || 'Falha ao sincronizar');
          }

          lastResult = data;
          consecutiveErrors = 0;

          // Update progress from response
          if (data?.current_page || data?.items_saved) {
            setProgress(prev => ({
              ...prev,
              status: 'syncing',
              currentPage: data.current_page || prev.currentPage,
              totalPages: data.total_pages || prev.totalPages,
              itemsSaved: data.items_saved || prev.itemsSaved,
              itemsTotal: data.items_total || prev.itemsTotal,
              itemsLinked: data.items_linked || prev.itemsLinked,
              errorMessage: null
            }));
          }

          if (data?.status === 'completed') {
            done = true;
          } else if (data?.status === 'failed') {
            retryCountRef.current++;
            if (retryCountRef.current < MAX_TOTAL_RETRIES) {
              log.info(`[useMelhorEnvioSync] Job falhou, tentativa ${retryCountRef.current}/${MAX_TOTAL_RETRIES}`);
              await new Promise(r => setTimeout(r, 2000));
            } else {
              done = true;
            }
          } else if (data?.status === 'running') {
            // Edge function pausou por tempo - chamar novamente imediatamente
            log.info(`[useMelhorEnvioSync] Página ${data.current_page}/${data.total_pages || '?'} - ${data.items_saved} salvos - continuando...`);
            await new Promise(r => setTimeout(r, 500)); // Pequeno delay antes de chamar novamente
          } else if (!data?.success) {
            throw new Error(data?.error || 'Erro desconhecido');
          } else {
            done = true;
          }
        } catch (callError: unknown) {
          consecutiveErrors++;
          retryCountRef.current++;
          log.error(`[useMelhorEnvioSync] Erro (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, getErrMsg(callError));

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS || retryCountRef.current >= MAX_TOTAL_RETRIES) {
            throw new Error(`Falha após ${retryCountRef.current} tentativas: ${getErrMsg(callError)}`);
          }

          // Backoff curto - a edge function é rápida agora
          await new Promise(r => setTimeout(r, Math.min(2000 * consecutiveErrors, 10000)));
        }
      }

      if (cancelledRef.current) {
        return { success: false, cancelled: true };
      }

      if (lastResult?.status === 'completed' || lastResult?.success) {
        toast({
          title: 'Sincronização concluída',
          description: `${lastResult.items_saved || lastResult.synced || 0} envios sincronizados, ${lastResult.items_linked || 0} vinculados a pedidos`
        });
      } else if (lastResult?.status === 'failed') {
        throw new Error(lastResult.error_message || lastResult.error || 'Falha na sincronização');
      }

      return { success: true, ...lastResult };
    } catch (error: unknown) {
      setProgress(prev => ({
        ...prev,
        status: 'failed',
        errorMessage: getErrMsg(error)
      }));
      toast({
        title: 'Erro',
        description: getErrMsg(error) || 'Falha ao sincronizar envios',
        variant: 'destructive'
      });
      return { success: false, error: getErrMsg(error) };
    } finally {
      setIsSyncing(false);
    }
  }, [toast]);

  const cancelSync = useCallback(async () => {
    cancelledRef.current = true;
    setIsSyncing(false);
    
    // Cancel via server-side function with tenant validation
    if (syncJob?.id) {
      await supabase.functions.invoke('manage-sync-jobs', {
        body: { action: 'cancel-me', job_id: syncJob.id },
      });
    }
    
    setProgress(prev => ({
      ...prev,
      status: 'cancelled',
      errorMessage: 'Sincronização cancelada'
    }));
  }, [syncJob]);

  const forceReset = useCallback(async () => {
    // Reset via server-side function with tenant validation
    await supabase.functions.invoke('manage-sync-jobs', {
      body: { action: 'reset-me' },
    });

    setSyncJob(null);
    setProgress({
      status: 'idle',
      currentPage: 0,
      totalPages: null,
      itemsSaved: 0,
      itemsTotal: null,
      itemsLinked: 0,
      errorMessage: null
    });

    toast({
      title: 'Jobs resetados',
      description: 'Todos os jobs de sincronização foram resetados'
    });
  }, [toast]);

  const resetProgress = useCallback(() => {
    setProgress({
      status: 'idle',
      currentPage: 0,
      totalPages: null,
      itemsSaved: 0,
      itemsTotal: null,
      itemsLinked: 0,
      errorMessage: null
    });
    setSyncJob(null);
  }, []);

  return {
    syncJob,
    progress,
    isSyncing,
    startSync,
    cancelSync,
    forceReset,
    resetProgress
  };
}
