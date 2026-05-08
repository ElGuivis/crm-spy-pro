import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { createLogger } from '@/lib/logger';
const log = createLogger('useBlingCodeMappings');

export interface BlingCodeMapping {
  id: string;
  tenant_id: string;
  integration_id: string;
  mapping_type: 'order_status' | 'payment_method';
  original_code: string;
  display_name: string;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DetectedCode {
  code: string;
  count: number;
  existingMapping?: BlingCodeMapping;
}

export function useBlingCodeMappings(integrationId: string) {
  const { tenantId } = useAuth();
  const [mappings, setMappings] = useState<BlingCodeMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [detectedStatusCodes, setDetectedStatusCodes] = useState<DetectedCode[]>([]);
  const [detectedPaymentCodes, setDetectedPaymentCodes] = useState<DetectedCode[]>([]);

  const fetchMappings = useCallback(async () => {
    if (!integrationId) return;
    
    try {
      const { data, error } = await supabase
        .from('bling_code_mappings')
        .select('id, tenant_id, integration_id, mapping_type, original_code, display_name, color, is_active, created_at, updated_at')
        .eq('integration_id', integrationId)
        .order('mapping_type', { ascending: true })
        .order('original_code', { ascending: true });

      if (error) throw error;
      setMappings((data as BlingCodeMapping[]) || []);
    } catch (error) {
      log.error('Error fetching mappings:', error);
    } finally {
      setLoading(false);
    }
  }, [integrationId]);

  const detectExistingCodes = useCallback(async () => {
    if (!integrationId) return;

    try {
      // Detect unique status codes from orders
      const { data: statusData } = await supabase
        .from('bling_orders')
        .select('situacao_id, situacao_nome')
        .eq('integration_id', integrationId)
        .not('situacao_id', 'is', null);

      // Count occurrences of each status
      const statusCounts: Record<string, { count: number; name: string | null }> = {};
      statusData?.forEach(order => {
        const code = String(order.situacao_id);
        if (!statusCounts[code]) {
          statusCounts[code] = { count: 0, name: order.situacao_nome };
        }
        statusCounts[code].count++;
      });

      // Detect unique payment methods from parcelas (formaPagamento.id)
      const { data: parcelasData } = await supabase
        .from('bling_orders')
        .select('parcelas')
        .eq('integration_id', integrationId)
        .not('parcelas', 'is', null);

      const paymentCounts: Record<string, number> = {};
      parcelasData?.forEach(order => {
        if (order.parcelas && Array.isArray(order.parcelas)) {
          order.parcelas.forEach((parcela: any) => {
            const paymentId = parcela?.formaPagamento?.id;
            if (paymentId) {
              const code = String(paymentId);
              if (!paymentCounts[code]) {
                paymentCounts[code] = 0;
              }
              paymentCounts[code]++;
            }
          });
        }
      });

      // Also include forma_pagamento field if it exists (for backwards compatibility)
      const { data: paymentFieldData } = await supabase
        .from('bling_orders')
        .select('forma_pagamento')
        .eq('integration_id', integrationId)
        .not('forma_pagamento', 'is', null);

      paymentFieldData?.forEach(order => {
        if (order.forma_pagamento) {
          if (!paymentCounts[order.forma_pagamento]) {
            paymentCounts[order.forma_pagamento] = 0;
          }
          paymentCounts[order.forma_pagamento]++;
        }
      });

      // Map with existing mappings
      const statusMappings = mappings.filter(m => m.mapping_type === 'order_status');
      const paymentMappings = mappings.filter(m => m.mapping_type === 'payment_method');

      const detectedStatuses: DetectedCode[] = Object.entries(statusCounts).map(([code, info]) => ({
        code,
        count: info.count,
        existingMapping: statusMappings.find(m => m.original_code === code)
      }));

      const detectedPayments: DetectedCode[] = Object.entries(paymentCounts).map(([code, count]) => ({
        code,
        count,
        existingMapping: paymentMappings.find(m => m.original_code === code)
      }));

      setDetectedStatusCodes(detectedStatuses.sort((a, b) => b.count - a.count));
      setDetectedPaymentCodes(detectedPayments.sort((a, b) => b.count - a.count));
    } catch (error) {
      log.error('Error detecting codes:', error);
    }
  }, [integrationId, mappings]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  useEffect(() => {
    if (!loading) {
      detectExistingCodes();
    }
  }, [loading, detectExistingCodes]);

  const saveMapping = async (
    mappingType: 'order_status' | 'payment_method',
    originalCode: string,
    displayName: string,
    color?: string
  ) => {
    if (!tenantId || !integrationId) return null;

    try {
      const { data, error } = await supabase
        .from('bling_code_mappings')
        .upsert({
          tenant_id: tenantId,
          integration_id: integrationId,
          mapping_type: mappingType,
          original_code: originalCode,
          display_name: displayName,
          color: color || null,
          is_active: true
        }, {
          onConflict: 'integration_id,mapping_type,original_code'
        })
        .select()
        .single();

      if (error) throw error;
      
      await fetchMappings();
      return data;
    } catch (error) {
      log.error('Error saving mapping:', error);
      throw error;
    }
  };

  const deleteMapping = async (mappingId: string) => {
    try {
      const { error } = await supabase
        .from('bling_code_mappings')
        .delete()
        .eq('id', mappingId);

      if (error) throw error;
      await fetchMappings();
    } catch (error) {
      log.error('Error deleting mapping:', error);
      throw error;
    }
  };

  const getDisplayName = useCallback((mappingType: 'order_status' | 'payment_method', originalCode: string) => {
    const mapping = mappings.find(
      m => m.mapping_type === mappingType && m.original_code === originalCode && m.is_active
    );
    return mapping?.display_name || null;
  }, [mappings]);

  const getColor = useCallback((mappingType: 'order_status' | 'payment_method', originalCode: string) => {
    const mapping = mappings.find(
      m => m.mapping_type === mappingType && m.original_code === originalCode && m.is_active
    );
    return mapping?.color || null;
  }, [mappings]);

  return {
    mappings,
    loading,
    detectedStatusCodes,
    detectedPaymentCodes,
    fetchMappings,
    saveMapping,
    deleteMapping,
    getDisplayName,
    getColor,
    refresh: () => {
      fetchMappings();
      detectExistingCodes();
    }
  };
}
