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
        .select('last_synced_at, last_offset, updated_at')
        .eq('integration_id', integrationId)
        .eq('entity_type', entityType)
        .maybeSingle();

      const offset = data?.last_offset ?? 0;
      const updatedAt = data?.updated_at ? new Date(data.updated_at).getTime() : 0;
      const stalledMs = Date.now() - updatedAt;
      const fullyDone = offset === 0 && data?.last_synced_at && data.last_synced_at !== s.baseline;

      if (fullyDone) {
        s.active = false;
        setSyncStatus({ ...INITIAL_STATUS, status: 'completed' });
        setTimeout(() => setSyncStatus(INITIAL_STATUS), 3000);
        return;
      }

      // Auto re-trigger if sync has stalled (no update in 30s) but data still pending
      if (offset > 0 && stalledMs > 30_000) {
        try {
          await supabase.functions.invoke('li-sync', { body: { syncType, integrationId } });
        } catch { /* ignore — next poll will retry */ }
      }

      const delay = Math.min(3000 * Math.pow(1.2, Math.min(s.attempts - 1, 15)), 15000);
      pollTimerRef.current = window.setTimeout(poll, delay);
    } catch {
      const delay = Math.min(3000 * Math.pow(1.2, Math.min(s.attempts - 1, 10)), 15000);
      pollTimerRef.current = window.setTimeout(poll, delay);
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
