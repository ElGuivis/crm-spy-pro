import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBlingSync, BlingSyncStatus } from './useBlingSync';
import { useSyncStatus } from './useSyncStatus';

import { createLogger } from '@/lib/logger';
const log = createLogger('useAdaptiveSync');

type AdaptiveSyncStatus = BlingSyncStatus | 'idle' | 'syncing' | 'completed' | 'failed';

interface UseAdaptiveSync {
  syncStatus: AdaptiveSyncStatus;
  startSync: () => Promise<void>;
  integrationType: string | null;
  isLoading: boolean;
}

/**
 * Hook that detects the integration type and uses the appropriate sync mechanism.
 * For Bling integrations, uses useBlingSync.
 * For Loja Integrada integrations, uses useSyncStatus.
 */
export function useAdaptiveSync(integrationId: string, syncType: string = 'all'): UseAdaptiveSync {
  const [integrationType, setIntegrationType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize both hooks
  const blingSync = useBlingSync(integrationId, syncType);
  const liSync = useSyncStatus(integrationId, syncType);

  // Fetch integration type on mount
  useEffect(() => {
    if (!integrationId) {
      setIsLoading(false);
      return;
    }

    const fetchIntegrationType = async () => {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('integrations')
        .select('type')
        .eq('id', integrationId)
        .single();

      if (error) {
        log.error('[useAdaptiveSync] Error fetching integration type:', error);
        setIntegrationType(null);
      } else {
        setIntegrationType(data?.type || null);
      }
      
      setIsLoading(false);
    };

    fetchIntegrationType();
  }, [integrationId]);

  // Get the appropriate sync status based on integration type
  const syncStatus: AdaptiveSyncStatus = integrationType === 'bling' 
    ? blingSync.syncStatus 
    : liSync.syncStatus.status;

  // Create adaptive startSync function
  const startSync = useCallback(async () => {
    if (integrationType === 'bling') {
      await blingSync.startSync();
    } else {
      await liSync.startSync();
    }
  }, [integrationType, blingSync, liSync]);

  return {
    syncStatus,
    startSync,
    integrationType,
    isLoading,
  };
}

/**
 * Helper to get the table name for a given data type based on integration type
 */
export function getTableName(integrationType: string | null, dataType: 'orders' | 'customers' | 'products'): string {
  if (integrationType === 'bling') {
    switch (dataType) {
      case 'orders': return 'bling_orders';
      case 'customers': return 'bling_customers';
      case 'products': return 'bling_products';
    }
  }
  
  // Default to Loja Integrada tables
  switch (dataType) {
    case 'orders': return 'li_orders';
    case 'customers': return 'li_customers';
    case 'products': return 'li_products';
  }
}

/**
 * Helper to check if an integration is Bling type
 */
export function isBlingIntegration(integrationType: string | null): boolean {
  return integrationType === 'bling';
}
