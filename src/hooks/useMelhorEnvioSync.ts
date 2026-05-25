import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';
import { useMeJobRealtime } from './useMeJobRealtime';

const log = createLogger('useMelhorEnvioSync');
function getErrMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

export function useMelhorEnvioSync(integrationId?: string) {
  const { syncJob, setSyncJob, isSyncing, setIsSyncing, progress, setProgress, idleProgress } = useMeJobRealtime(integrationId);
  const cancelledRef = useRef(false);
  const retryCountRef = useRef(0);
  const { toast } = useToast();

  const startSync = useCallback(async (forceReset = false) => {
    cancelledRef.current = false;
    retryCountRef.current = 0;
    setIsSyncing(true);
    setProgress({ status: 'syncing', currentPage: 0, totalPages: null, itemsSaved: 0, itemsTotal: null, itemsLinked: 0, errorMessage: null });

    try {
      let done = false;
      let lastResult: any = null;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 15;
      const MAX_TOTAL_RETRIES = 500;
      const MAX_TOTAL_TIME_MS = 60 * 60 * 1000;
      const INVOKE_TIMEOUT_MS = 65000;
      const startTime = Date.now();

      while (!done && !cancelledRef.current) {
        if (Date.now() - startTime > MAX_TOTAL_TIME_MS) {
          log.info('[useMelhorEnvioSync] Limite de 60min atingido');
          toast({ title: 'Sincronização parcial', description: 'Limite de tempo atingido. Execute novamente para continuar de onde parou.' });
          done = true;
          break;
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);

          const { data, error } = await supabase.functions.invoke('melhor-envio', {
            body: { action: 'sync_shipments', force_reset: forceReset && retryCountRef.current === 0 }
          });

          clearTimeout(timeoutId);

          if (cancelledRef.current) {
            setProgress(prev => ({ ...prev, status: 'cancelled', errorMessage: 'Sincronização cancelada' }));
            return { success: false, cancelled: true };
          }

          if (error) throw new Error(getErrMsg(error) || 'Falha ao sincronizar');

          lastResult = data;
          consecutiveErrors = 0;

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
            log.info(`[useMelhorEnvioSync] Página ${data.current_page}/${data.total_pages || '?'} - ${data.items_saved} salvos - continuando...`);
            await new Promise(r => setTimeout(r, 500));
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

          await new Promise(r => setTimeout(r, Math.min(2000 * consecutiveErrors, 10000)));
        }
      }

      if (cancelledRef.current) return { success: false, cancelled: true };

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
      setProgress(prev => ({ ...prev, status: 'failed', errorMessage: getErrMsg(error) }));
      toast({ title: 'Erro', description: getErrMsg(error) || 'Falha ao sincronizar envios', variant: 'destructive' });
      return { success: false, error: getErrMsg(error) };
    } finally {
      setIsSyncing(false);
    }
  }, [toast, setIsSyncing, setProgress]);

  const cancelSync = useCallback(async () => {
    cancelledRef.current = true;
    setIsSyncing(false);
    if (syncJob?.id) {
      await supabase.functions.invoke('manage-sync-jobs', {
        body: { action: 'cancel-me', job_id: syncJob.id },
      });
    }
    setProgress(prev => ({ ...prev, status: 'cancelled', errorMessage: 'Sincronização cancelada' }));
  }, [syncJob, setIsSyncing, setProgress]);

  const forceReset = useCallback(async () => {
    await supabase.functions.invoke('manage-sync-jobs', { body: { action: 'reset-me' } });
    setSyncJob(null);
    setProgress(idleProgress);
    toast({ title: 'Jobs resetados', description: 'Todos os jobs de sincronização foram resetados' });
  }, [toast, setSyncJob, setProgress, idleProgress]);

  const resetProgress = useCallback(() => {
    setProgress(idleProgress);
    setSyncJob(null);
  }, [setProgress, setSyncJob, idleProgress]);

  return { syncJob, progress, isSyncing, startSync, cancelSync, forceReset, resetProgress };
}
