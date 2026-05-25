import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

const idleProgress: SyncProgress = {
  status: 'idle', currentPage: 0, totalPages: null, itemsSaved: 0, itemsTotal: null, itemsLinked: 0, errorMessage: null
};

function jobToProgress(job: MeSyncJob, status: SyncProgress['status']): SyncProgress {
  return {
    status,
    currentPage: job.current_page || 0,
    totalPages: job.total_pages,
    itemsSaved: job.items_saved || 0,
    itemsTotal: job.items_total,
    itemsLinked: job.items_linked || 0,
    errorMessage: status === 'failed' ? job.error_message : null,
  };
}

export function useMeJobRealtime(integrationId?: string) {
  const [syncJob, setSyncJob] = useState<MeSyncJob | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>(idleProgress);

  // Check for active job on mount
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
        const updatedAt = new Date(data.updated_at).getTime();
        const isStuck = Date.now() - updatedAt > 10 * 60 * 1000;

        if (isStuck) {
          await supabase.functions.invoke('manage-sync-jobs', {
            body: { action: 'cancel-me', job_id: data.id },
          });
          return;
        }

        setSyncJob(data as unknown as MeSyncJob);
        setIsSyncing(true);
        setProgress(jobToProgress(data as unknown as MeSyncJob, 'syncing'));
      }
    };

    checkActiveJob();
  }, [integrationId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('me-sync-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'me_sync_jobs' }, (payload) => {
        const newData = payload.new as unknown as MeSyncJob;

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          setSyncJob(newData);
          if (newData.status === 'running' || newData.status === 'pending') {
            setIsSyncing(true);
            setProgress(jobToProgress(newData, 'syncing'));
          } else if (newData.status === 'completed') {
            setIsSyncing(false);
            setProgress(jobToProgress(newData, 'completed'));
          } else if (newData.status === 'failed') {
            setIsSyncing(false);
            setProgress(jobToProgress(newData, 'failed'));
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [integrationId]);

  return { syncJob, setSyncJob, isSyncing, setIsSyncing, progress, setProgress, idleProgress };
}
