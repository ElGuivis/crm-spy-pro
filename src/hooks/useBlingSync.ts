import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

import { createLogger } from '@/lib/logger';
const log = createLogger('useBlingSync');

export type BlingSyncStatus = 'idle' | 'syncing' | 'pending' | 'completed' | 'failed' | 'cancelled';

interface BlingSyncJob {
  id: string;
  status: string;
  job_type: string;
  current_page: number;
  resume_page: number;
  processed_count: number;
  saved_count: number;
  total_count: number;
  error_message: string | null;
  sync_log_id: string;
  last_heartbeat_at: string | null;
  updated_at: string;
  attempts: number;
}

interface UseBlingSync {
  syncStatus: BlingSyncStatus;
  currentJob: BlingSyncJob | null;
  startSync: (storeIds?: number[]) => Promise<void>;
  checkForNew: () => Promise<void>;
  updateStock: () => Promise<void>;
  cancelSync: () => Promise<void>;
  resumeSync: () => Promise<void>;
  syncLogId: string | null;
  isStuck: boolean;
  lastHeartbeatAgo: number | null;
}

export function useBlingSync(integrationId: string, syncType: string = 'all'): UseBlingSync {
  const [syncStatus, setSyncStatus] = useState<BlingSyncStatus>('idle');
  const [currentJob, setCurrentJob] = useState<BlingSyncJob | null>(null);
  const [syncLogId, setSyncLogId] = useState<string | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [lastHeartbeatAgo, setLastHeartbeatAgo] = useState<number | null>(null);

  // Check for active sync jobs on mount
  useEffect(() => {
    if (!integrationId) return;

    const checkActiveJobs = async () => {
      // Filter by job_type if syncType is specific
      let query = supabase
        .from('bling_sync_jobs')
        .select('id, integration_id, tenant_id, job_type, sync_log_id, status, current_page, resume_page, max_pages_per_run, processed_count, saved_count, total_count, started_at, completed_at, error_message, attempts, last_heartbeat_at, locked_at, locked_by, created_at, updated_at')
        .eq('integration_id', integrationId)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (syncType !== 'all') {
        query = query.eq('job_type', syncType);
      }

      const { data: activeJobs } = await query;

      if (activeJobs && activeJobs.length > 0) {
        const job = activeJobs[0] as BlingSyncJob;
        setSyncStatus(job.status === 'pending' ? 'pending' : 'syncing');
        setCurrentJob(job);
        setSyncLogId(job.sync_log_id);
        
        // Check if stuck (no heartbeat for > 2 minutes)
        if (job.last_heartbeat_at) {
          const heartbeatAge = Date.now() - new Date(job.last_heartbeat_at).getTime();
          setLastHeartbeatAgo(heartbeatAge);
          setIsStuck(heartbeatAge > 2 * 60 * 1000);
        }
      }
    };

    checkActiveJobs();
  }, [integrationId, syncType]);

  // Subscribe to job updates
  useEffect(() => {
    if (!integrationId) return;

    const channel = supabase
      .channel(`bling-sync-${integrationId}-${syncType}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bling_sync_jobs',
          filter: `integration_id=eq.${integrationId}`,
        },
        (payload) => {
          const job = payload.new as BlingSyncJob;
          
          // Only process jobs of our type
          if (syncType !== 'all' && job.job_type !== syncType) return;
          
          if (job.status === 'running') {
            setSyncStatus('syncing');
            setCurrentJob(job);
            setSyncLogId(job.sync_log_id);
            setIsStuck(false);
            
            if (job.last_heartbeat_at) {
              setLastHeartbeatAgo(Date.now() - new Date(job.last_heartbeat_at).getTime());
            }
          } else if (job.status === 'pending') {
            setSyncStatus('pending');
            setCurrentJob(job);
            setSyncLogId(job.sync_log_id);
            
            // Check if stuck
            if (job.last_heartbeat_at) {
              const heartbeatAge = Date.now() - new Date(job.last_heartbeat_at).getTime();
              setLastHeartbeatAgo(heartbeatAge);
              setIsStuck(heartbeatAge > 2 * 60 * 1000);
            }
          } else if (job.status === 'completed') {
            setSyncStatus('completed');
            setCurrentJob(job);
            setIsStuck(false);
            // Reset to idle after a delay
            setTimeout(() => {
              setSyncStatus('idle');
              setCurrentJob(null);
            }, 2000);
          } else if (job.status === 'cancelled') {
            setSyncStatus('cancelled');
            setCurrentJob(job);
            setIsStuck(false);
            // Reset to idle after a delay
            setTimeout(() => {
              setSyncStatus('idle');
              setCurrentJob(null);
            }, 2000);
          } else if (job.status === 'failed') {
            setSyncStatus('failed');
            setCurrentJob(job);
            setIsStuck(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [integrationId, syncType]);

  // Periodically check heartbeat age for stuck detection
  useEffect(() => {
    if (!currentJob || (syncStatus !== 'syncing' && syncStatus !== 'pending')) return;

    const interval = setInterval(async () => {
      // Re-fetch the job to get latest heartbeat
      const { data } = await supabase
        .from('bling_sync_jobs')
        .select('last_heartbeat_at, status')
        .eq('id', currentJob.id)
        .single();
      
      if (data?.last_heartbeat_at) {
        const heartbeatAge = Date.now() - new Date(data.last_heartbeat_at).getTime();
        setLastHeartbeatAgo(heartbeatAge);
        setIsStuck(heartbeatAge > 2 * 60 * 1000 && (data.status === 'running' || data.status === 'pending'));
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [currentJob?.id, syncStatus]);

  const startSync = useCallback(async (storeIds?: number[]) => {
    if (!integrationId) {
      log.error('[useBlingSync] No integrationId provided');
      return;
    }

    setSyncStatus('syncing');
    setCurrentJob(null);
    setSyncLogId(null);
    setIsStuck(false);

    try {
      const { data, error } = await supabase.functions.invoke('bling-sync', {
        body: { 
          integrationId, 
          syncType,
          storeIds,
          incremental: false  
        },
      });

      if (error) {
        log.error('[useBlingSync] Error starting sync:', error);
        setSyncStatus('failed');
        return;
      }

      if (data?.syncLogId) {
        setSyncLogId(data.syncLogId);
      }

      log.info('[useBlingSync] Sync started:', data);
      
    } catch (err) {
      log.error('[useBlingSync] Error:', err);
      setSyncStatus('failed');
    }
  }, [integrationId, syncType]);

  // Check for new/recent records only (incremental sync) - uses saved store IDs
  const checkForNew = useCallback(async () => {
    if (!integrationId) {
      log.error('[useBlingSync] No integrationId provided');
      return;
    }

    setSyncStatus('syncing');
    setCurrentJob(null);
    setSyncLogId(null);
    setIsStuck(false);

    try {
      // For products, call bling-job-processor with syncType: products
      if (syncType === 'products') {
        const { data, error } = await supabase.functions.invoke('bling-job-processor', {
          body: { 
            integrationId, 
            syncType: 'products',
            manual: true
          },
        });

        if (error) {
          log.error('[useBlingSync] Error checking for new products:', error);
          setSyncStatus('failed');
          return;
        }

        log.info('[useBlingSync] New products check completed:', data);
        
        // Show completed briefly then reset
        setSyncStatus('completed');
        setTimeout(() => {
          setSyncStatus('idle');
        }, 2000);
        return;
      }

      // For orders (or 'all'), use existing bling-sync logic
      // Fetch saved store IDs from integration
      const { data: integration } = await supabase
        .from('integrations')
        .select('id, metadata')
        .eq('id', integrationId)
        .single();
      
      const savedStoreIds = (integration as any)?.metadata?.bling_store_ids as number[] | null;

      const { data, error } = await supabase.functions.invoke('bling-sync', {
        body: { 
          integrationId, 
          syncType,
          storeIds: savedStoreIds,
          incremental: true  
        },
      });

      if (error) {
        log.error('[useBlingSync] Error checking for new:', error);
        setSyncStatus('failed');
        return;
      }

      if (data?.syncLogId) {
        setSyncLogId(data.syncLogId);
      }

      log.info('[useBlingSync] Incremental sync started:', data);
      
    } catch (err) {
      log.error('[useBlingSync] Error:', err);
      setSyncStatus('failed');
    }
  }, [integrationId, syncType]);

  // Update stock for existing products (incremental stock sync)
  const updateStock = useCallback(async () => {
    if (!integrationId) {
      log.error('[useBlingSync] No integrationId provided');
      return;
    }

    setSyncStatus('syncing');
    setCurrentJob(null);
    setSyncLogId(null);
    setIsStuck(false);

    try {
      const { data, error } = await supabase.functions.invoke('bling-job-processor', {
        body: { 
          integrationId, 
          syncType: 'products_stock',
          manual: true
        },
      });

      if (error) {
        log.error('[useBlingSync] Error updating stock:', error);
        setSyncStatus('failed');
        return;
      }

      log.info('[useBlingSync] Stock update completed:', data);
      
      // Show completed briefly then reset
      setSyncStatus('completed');
      setTimeout(() => {
        setSyncStatus('idle');
      }, 2000);
      
    } catch (err) {
      log.error('[useBlingSync] Error:', err);
      setSyncStatus('failed');
    }
  }, [integrationId]);

  // Resume a paused/stuck sync - calls the job processor directly
  const resumeSync = useCallback(async () => {
    if (!currentJob) {
      log.error('[useBlingSync] No current job to resume');
      return;
    }

    log.info('[useBlingSync] Resuming job:', currentJob.id);
    setSyncStatus('syncing');
    setIsStuck(false);

    try {
      // Call the products job processor with the specific job ID
      const { data, error } = await supabase.functions.invoke('bling-products-job-processor', {
        body: { jobId: currentJob.id },
      });

      if (error) {
        log.error('[useBlingSync] Error resuming sync:', error);
        return;
      }

      log.info('[useBlingSync] Resume triggered:', data);
      
    } catch (err) {
      log.error('[useBlingSync] Error:', err);
    }
  }, [currentJob]);

  // Cancel sync — via server-side function with tenant validation
  const cancelSync = useCallback(async () => {
    if (!integrationId) {
      log.error('[useBlingSync] No integrationId provided');
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('manage-sync-jobs', {
        body: {
          action: 'cancel-bling',
          integration_id: integrationId,
          sync_log_id: syncLogId,
        },
      });

      if (error) {
        log.error('[useBlingSync] Error cancelling sync:', error);
        return;
      }

      setSyncStatus('cancelled');
      setIsStuck(false);
      
    } catch (err) {
      log.error('[useBlingSync] Error cancelling:', err);
    }
  }, [integrationId, syncLogId]);

  return {
    syncStatus,
    currentJob,
    startSync,
    checkForNew,
    updateStock,
    cancelSync,
    resumeSync,
    syncLogId,
    isStuck,
    lastHeartbeatAgo,
  };
}
