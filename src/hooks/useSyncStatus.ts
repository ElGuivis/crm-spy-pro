import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SyncStatus {
  isActive: boolean;
  status: 'idle' | 'syncing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    saved: number;
  };
  syncLogId: string | null;
}

const INITIAL_STATUS: SyncStatus = {
  isActive: false,
  status: 'idle',
  progress: { current: 0, total: 0, saved: 0 },
  syncLogId: null,
};

export function useSyncStatus(integrationId: string, syncType: string) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(INITIAL_STATUS);
  const pollTimerRef = useRef<number | null>(null);
  const stateRef = useRef({ baseline: '', attempts: 0, active: false });

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      stateRef.current.active = false;
    };
  }, []);

  const poll = useCallback(async () => {
    const s = stateRef.current;
    if (!s.active) return;
    s.attempts += 1;

    try {
      const entityType = syncType === 'customers' ? 'customers' : syncType === 'products' ? 'products' : 'orders';
      const { data } = await supabase
        .from('li_sync_state')
        .select('last_synced_at')
        .eq('integration_id', integrationId)
        .eq('entity_type', entityType)
        .maybeSingle();

      const current = data?.last_synced_at || '';
      const changed = current && current !== s.baseline;

      if (changed || s.attempts >= 60) {
        s.active = false;
        setSyncStatus({
          ...INITIAL_STATUS,
          status: changed ? 'completed' : 'failed',
        });
        setTimeout(() => setSyncStatus(INITIAL_STATUS), 3000);
        return;
      }

      const delay = Math.min(2000 * Math.pow(1.3, s.attempts - 1), 10000);
      pollTimerRef.current = window.setTimeout(poll, delay);
    } catch {
      if (s.attempts < 60) {
        pollTimerRef.current = window.setTimeout(poll, 5000);
      } else {
        s.active = false;
        setSyncStatus({ ...INITIAL_STATUS, status: 'failed' });
      }
    }
  }, [integrationId, syncType]);

  const startSync = useCallback(async () => {
    // Get baseline
    const entityType = syncType === 'customers' ? 'customers' : syncType === 'products' ? 'products' : 'orders';
    const { data } = await supabase
      .from('li_sync_state')
      .select('last_synced_at')
      .eq('integration_id', integrationId)
      .eq('entity_type', entityType)
      .maybeSingle();

    stateRef.current = { baseline: data?.last_synced_at || '', attempts: 0, active: true };

    setSyncStatus({
      isActive: true,
      status: 'syncing',
      progress: { current: 0, total: 0, saved: 0 },
      syncLogId: null,
    });

    try {
      const { data: result, error } = await supabase.functions.invoke('li-sync', {
        body: { syncType, integrationId },
      });

      if (error) {
        stateRef.current.active = false;
        setSyncStatus({ ...INITIAL_STATUS, status: 'failed' });
        throw error;
      }

      // Start polling
      pollTimerRef.current = window.setTimeout(poll, 3000);
      return result;
    } catch (err) {
      stateRef.current.active = false;
      setSyncStatus({ ...INITIAL_STATUS, status: 'failed' });
      throw err;
    }
  }, [integrationId, syncType, poll]);

  const cancelSync = useCallback(() => {
    stateRef.current.active = false;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setSyncStatus(INITIAL_STATUS);
  }, []);

  return { syncStatus, startSync, cancelSync };
}
