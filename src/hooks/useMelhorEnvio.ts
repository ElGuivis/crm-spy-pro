import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';

const logger = createLogger('MelhorEnvio');
function getErrMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

// Re-export do hook de sync progressivo
export { useMelhorEnvioSync } from './useMelhorEnvioSync';

interface MelhorEnvioUser {
  id: string;
  name: string;
  email: string;
}

interface MelhorEnvioStatus {
  connected: boolean;
  expired: boolean;
  user: MelhorEnvioUser | null;
  expires_at: string | null;
}

export interface MelhorEnvioShipment {
  id: string;
  me_id: string;
  order_id: string | null;
  order_number: string | null;
  external_order_number: string | null;
  tracking_code: string | null;
  protocol: string | null;
  status: string | null;
  carrier: string | null;
  service_name: string | null;
  price: number | null;
  discount: number | null;
  weight: number | null;
  height: number | null;
  width: number | null;
  length: number | null;
  format: string | null;
  dimensions: unknown;
  insurance_value: number | null;
  receipt: boolean | null;
  own_hand: boolean | null;
  collect: boolean | null;
  from_address: unknown;
  to_address: unknown;
  tracking_events: unknown;
  // Campos do destinatário
  receiver_name: string | null;
  receiver_phone: string | null;
  receiver_city: string | null;
  receiver_state: string | null;
  receiver_address: unknown;
  invoice: unknown;
  volumes: unknown;
  products: unknown;
  authorization_code: string | null;
  print_url: string | null;
  preview_url: string | null;
  delivery_min: number | null;
  delivery_max: number | null;
  estimated_delivery_at: string | null;
  paid_at: string | null;
  generated_at: string | null;
  posted_at: string | null;
  delivered_at: string | null;
  created_at: string | null;
  last_sync_at: string | null;
  // New enriched fields
  sender_document: string | null;
  sender_email: string | null;
  sender_phone: string | null;
  receiver_email: string | null;
  receiver_document: string | null;
  receiver_note: string | null;
  agency_name: string | null;
  agency_address: unknown;
  cte_key: string | null;
  contract: string | null;
  billed_weight: number | null;
  non_commercial: boolean | null;
  conciliation: unknown;
  additional_info: unknown;
  service_details: unknown;
  financial_details: unknown;
}

export interface ShipmentFilters {
  status?: string;
  carrier?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  receiverCity?: string;
  receiverState?: string;
  page?: number;
  pageSize?: number;
  integrationId?: string;
  delayedOnly?: boolean;
}

export function useMelhorEnvio() {
  const [status, setStatus] = useState<MelhorEnvioStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const { toast } = useToast();
  const { loading: authLoading } = useAuth();

  const fetchStatus = useCallback(async () => {
    try {
      logger.debug('Fetching status');
      const { data: result, error: invokeError } = await supabase.functions.invoke('melhor-envio', {
        body: { action: 'status' },
      });

      if (invokeError) {
        logger.error('Error fetching status', invokeError);
        return;
      }

      logger.debug('Status received', result);

      if (result?.success) {
        setStatus({
          connected: result.connected,
          expired: result.expired || false,
          user: result.user || null,
          expires_at: result.expires_at || null,
        });
      }
    } catch (error) {
      logger.error('Error fetching status', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    const urlParams = new URLSearchParams(window.location.search);
    const callbackStatus = urlParams.get('status');
    const reason = urlParams.get('reason');
    const melhorEnvio = urlParams.get('melhor_envio');

    if (callbackStatus === 'ok' && melhorEnvio === 'connected') {
      logger.info('Connection successful');
      toast({
        title: 'Sucesso',
        description: 'Melhor Envio conectado com sucesso!'
      });
      window.history.replaceState({}, document.title, '/integrations');
      fetchStatus();
    } else if (callbackStatus === 'error') {
      logger.error('Callback error', { reason });
      toast({
        title: 'Erro',
        description: reason ? decodeURIComponent(reason) : 'Falha ao conectar com Melhor Envio',
        variant: 'destructive'
      });
      window.history.replaceState({}, document.title, '/integrations');
      fetchStatus();
    } else {
      fetchStatus();
    }
  }, [authLoading, fetchStatus, toast]);

  const startOAuthFlow = useCallback(async () => {
    setIsConnecting(true);
    try {
      const frontendUrl = window.location.origin;

      const { data: result, error } = await supabase.functions.invoke('melhor-envio', {
        body: {
          action: 'authorize',
          frontend_url: frontendUrl,
        },
      });

      if (error) {
        throw new Error(getErrMsg(error) || 'Falha ao iniciar autenticação');
      }

      if (result?.success && result.auth_url) {
        logger.info('Redirecting to OAuth');
        window.location.href = result.auth_url;
        return;
      }

      throw new Error(result?.error || 'Falha ao iniciar autenticação');
    } catch (error: unknown) {
      logger.error('OAuth error', error);
      toast({
        title: 'Erro',
        description: getErrMsg(error) || 'Falha ao conectar com Melhor Envio',
        variant: 'destructive'
      });
      setIsConnecting(false);
    }
  }, [toast]);

  const handleCallback = useCallback(async (_code: string) => {
    logger.debug('handleCallback called - processed by backend');
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const { data: result, error } = await supabase.functions.invoke('melhor-envio', {
        body: { action: 'disconnect' },
      });

      if (error) {
        throw new Error(getErrMsg(error) || 'Falha ao desconectar');
      }

      if (result?.success) {
        toast({
          title: 'Desconectado',
          description: 'Melhor Envio desconectado com sucesso'
        });
        setStatus({
          connected: false,
          expired: false,
          user: null,
          expires_at: null
        });
      }
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: getErrMsg(error) || 'Falha ao desconectar',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const syncShipments = useCallback(async () => {
    setIsSyncing(true);
    setSyncProgress('Buscando envios...');
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio', {
        body: { action: 'sync_shipments' },
      });

      if (error) {
        throw new Error(getErrMsg(error) || 'Falha ao sincronizar');
      }

      if (data?.success) {
        const totalValue = data.total_value ? ` (R$ ${data.total_value.toFixed(2)} em fretes)` : '';
        toast({
          title: 'Sincronização concluída',
          description: `${data.synced} envios sincronizados${totalValue}`
        });
        return { success: true, synced: data.synced, total_value: data.total_value };
      }

      throw new Error(data?.error || 'Falha ao sincronizar');
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: getErrMsg(error) || 'Falha ao sincronizar envios',
        variant: 'destructive'
      });
      return { success: false, error: getErrMsg(error) };
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [toast]);

  const syncTracking = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio', {
        body: { action: 'sync_tracking' },
      });

      if (error) {
        throw new Error(getErrMsg(error) || 'Falha ao atualizar rastreio');
      }

      if (data?.success) {
        toast({
          title: 'Rastreio atualizado',
          description: `${data.updated} envios atualizados`
        });
        return { success: true, updated: data.updated };
      }

      throw new Error(data?.error || 'Falha ao atualizar rastreio');
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: getErrMsg(error) || 'Falha ao atualizar rastreio',
        variant: 'destructive'
      });
      return { success: false, error: getErrMsg(error) };
    }
  }, [toast]);

  const syncSingleShipment = useCallback(async (shipmentId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio', {
        body: {
          action: 'sync_single',
          shipment_id: shipmentId,
        },
      });

      if (error) {
        throw new Error(getErrMsg(error) || 'Falha ao atualizar rastreio');
      }

      if (data?.success) {
        toast({
          title: 'Rastreio atualizado',
          description: 'Informações do envio atualizadas'
        });
        return { success: true, status: data.status };
      }

      throw new Error(data?.error || 'Falha ao atualizar rastreio');
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: getErrMsg(error) || 'Falha ao atualizar rastreio',
        variant: 'destructive'
      });
      return { success: false, error: getErrMsg(error) };
    }
  }, [toast]);

  return {
    status,
    isLoading,
    isConnecting,
    isSyncing,
    syncProgress,
    startOAuthFlow,
    handleCallback,
    disconnect,
    syncShipments,
    syncTracking,
    syncSingleShipment,
    refetch: fetchStatus
  };
}

// Interface para estatísticas globais
export interface GlobalShipmentStats {
  total: number;
  pending: number;
  posted: number;
  inTransit: number;
  delivered: number;
  canceled: number;
  returning: number;
  delayed: number;
  totalValue: number;
}

// Hook para buscar envios do banco COM REALTIME E PAGINAÇÃO
export function useMelhorEnvioShipments(filters: ShipmentFilters = {}) {
  const [shipments, setShipments] = useState<MelhorEnvioShipment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [globalStats, setGlobalStats] = useState<GlobalShipmentStats>({
    total: 0,
    pending: 0,
    posted: 0,
    inTransit: 0,
    delivered: 0,
    canceled: 0,
    returning: 0,
    delayed: 0,
    totalValue: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 25;

  // Fetch global stats (filtered by integrationId)
  const fetchGlobalStats = useCallback(async () => {
    try {
      const now = new Date().toISOString();
      
      // Build base query filter for integration
      const integrationFilter = filters.integrationId 
        ? (q: any) => q.eq('integration_id', filters.integrationId)
        : (q: any) => q;

      // Run all count queries in parallel
      const [
        totalResult,
        pendingResult,
        postedResult,
        inTransitResult,
        deliveredResult,
        canceledResult,
        returningResult,
        delayedResult,
        valueResult
      ] = await Promise.all([
        integrationFilter(supabase.from('me_shipments').select('id', { count: 'exact', head: true })),
        integrationFilter(supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
        integrationFilter(supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('status', 'posted')),
        integrationFilter(supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('status', 'in_transit')),
        integrationFilter(supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('status', 'delivered')),
        integrationFilter(supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('status', 'canceled')),
        integrationFilter(supabase.from('me_shipments').select('id', { count: 'exact', head: true }).or('status.eq.returning,status.eq.returned')),
        integrationFilter(supabase.from('me_shipments')
          .select('id', { count: 'exact', head: true })
          .not('status', 'in', '("delivered","canceled")')
          .not('estimated_delivery_at', 'is', null)
          .lt('estimated_delivery_at', now)),
        integrationFilter(supabase.from('me_shipments').select('price'))
      ]);

      const totalValue = (valueResult.data || []).reduce((sum, s) => sum + (s.price || 0), 0);

      setGlobalStats({
        total: totalResult.count || 0,
        pending: pendingResult.count || 0,
        posted: postedResult.count || 0,
        inTransit: inTransitResult.count || 0,
        delivered: deliveredResult.count || 0,
        canceled: canceledResult.count || 0,
        returning: returningResult.count || 0,
        delayed: delayedResult.count || 0,
        totalValue
      });
    } catch (err) {
      logger.error('Error fetching global stats', err);
    }
  }, [filters.integrationId]);

  const fetchShipments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Helper to apply common filters
      const applyFilters = (query: any) => {
        if (filters.integrationId) {
          query = query.eq('integration_id', filters.integrationId);
        }
        
        // If delayedOnly, filter for delayed shipments
        if (filters.delayedOnly) {
          query = query
            .not('status', 'in', '("delivered","canceled")')
            .not('estimated_delivery_at', 'is', null)
            .lt('estimated_delivery_at', new Date().toISOString());
        } else {
          // Normal status filter
          if (filters.status && filters.status !== 'all') {
            query = query.eq('status', filters.status);
          }
        }
        
        if (filters.carrier && filters.carrier !== 'all') {
          query = query.eq('carrier', filters.carrier);
        }
        if (filters.search) {
          query = query.or(`tracking_code.ilike.%${filters.search}%,order_number.ilike.%${filters.search}%,external_order_number.ilike.%${filters.search}%,protocol.ilike.%${filters.search}%,receiver_name.ilike.%${filters.search}%`);
        }
        if (filters.dateFrom) {
          query = query.gte('created_at', filters.dateFrom);
        }
        if (filters.dateTo) {
          query = query.lte('created_at', filters.dateTo);
        }
        if (filters.receiverCity) {
          query = query.eq('receiver_city', filters.receiverCity);
        }
        if (filters.receiverState) {
          query = query.eq('receiver_state', filters.receiverState);
        }
        return query;
      };

      // Primeiro, buscar contagem total
      let countQuery = supabase
        .from('me_shipments')
        .select('id', { count: 'exact', head: true });
      countQuery = applyFilters(countQuery);

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Agora buscar os dados paginados
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const ME_SHIPMENT_SELECT = 'id, integration_id, me_id, order_id, order_number, external_order_number, tracking_code, protocol, status, carrier, service_name, price, discount, weight, height, width, length, format, dimensions, insurance_value, receipt, own_hand, collect, from_address, to_address, tracking_events, receiver_name, receiver_phone, receiver_city, receiver_state, receiver_address, invoice, volumes, products, authorization_code, print_url, preview_url, delivery_min, delivery_max, estimated_delivery_at, paid_at, generated_at, posted_at, delivered_at, created_at, last_sync_at, sender_document, sender_email, sender_phone, receiver_email, receiver_document, receiver_note, agency_name, agency_address, cte_key, contract, billed_weight, non_commercial, conciliation, additional_info, service_details, financial_details, li_order_id, bling_order_id';

      let query = supabase
        .from('me_shipments')
        .select(ME_SHIPMENT_SELECT)
        .order('generated_at', { ascending: false, nullsFirst: false })
        .range(from, to);
      query = applyFilters(query);

      const { data, error: queryError } = await query;

      if (queryError) {
        throw queryError;
      }

      setShipments(data || []);
    } catch (err: unknown) {
      logger.error('Error fetching shipments', err);
      setError(getErrMsg(err));
    } finally {
      setIsLoading(false);
    }
  }, [filters.status, filters.carrier, filters.search, filters.dateFrom, filters.dateTo, filters.receiverCity, filters.receiverState, filters.integrationId, filters.delayedOnly, page, pageSize]);

  useEffect(() => {
    fetchShipments();
    fetchGlobalStats();
  }, [fetchShipments, fetchGlobalStats]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('me_shipments_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'me_shipments'
        },
        (payload) => {
          logger.debug('Realtime update', payload);
          
          if (payload.eventType === 'INSERT') {
            setShipments(prev => [payload.new as MelhorEnvioShipment, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setShipments(prev => prev.map(s => 
              s.id === (payload.new as any).id ? payload.new as MelhorEnvioShipment : s
            ));
          } else if (payload.eventType === 'DELETE') {
            setShipments(prev => prev.filter(s => s.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Calcular estatísticas
  const calculateDelayedCount = () => {
    return shipments.filter(s => {
      if (!s.estimated_delivery_at) return false;
      if (['delivered', 'canceled'].includes(s.status || '')) return false;
      return new Date(s.estimated_delivery_at) < new Date();
    }).length;
  };

  const stats = {
    total: shipments.length,
    pending: shipments.filter(s => s.status === 'pending').length,
    posted: shipments.filter(s => s.status === 'posted').length,
    inTransit: shipments.filter(s => s.status === 'in_transit').length,
    delivered: shipments.filter(s => s.status === 'delivered').length,
    canceled: shipments.filter(s => s.status === 'canceled').length,
    returning: shipments.filter(s => s.status === 'returning' || s.status === 'returned').length,
    delayed: calculateDelayedCount(),
    totalValue: shipments.reduce((sum, s) => sum + (s.price || 0), 0),
    averageDeliveryDays: calculateAverageDeliveryDays(shipments)
  };

  // Extrair transportadoras únicas
  const carriers = [...new Set(shipments.map(s => s.carrier).filter(Boolean))];

  // Extrair cidades únicas
  const cities = [...new Set(shipments.map(s => s.receiver_city).filter(Boolean))];

  // Extrair estados únicos
  const states = [...new Set(shipments.map(s => s.receiver_state).filter(Boolean))];

  // Calcular total de páginas
  const totalPages = Math.ceil(totalCount / pageSize);

  const refetch = useCallback(() => {
    fetchShipments();
    fetchGlobalStats();
  }, [fetchShipments, fetchGlobalStats]);

  return {
    shipments,
    isLoading,
    error,
    refetch,
    stats,
    globalStats,
    carriers,
    cities,
    states,
    totalCount,
    totalPages,
    currentPage: page,
    pageSize
  };
}

// Função auxiliar para calcular média de dias de entrega
function calculateAverageDeliveryDays(shipments: MelhorEnvioShipment[]): number {
  const deliveredShipments = shipments.filter(s => s.status === 'delivered' && s.posted_at && s.delivered_at);
  
  if (deliveredShipments.length === 0) return 0;
  
  const totalDays = deliveredShipments.reduce((sum, s) => {
    const posted = new Date(s.posted_at!);
    const delivered = new Date(s.delivered_at!);
    const days = Math.ceil((delivered.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24));
    return sum + days;
  }, 0);
  
  return Math.round(totalDays / deliveredShipments.length);
}

export type { MelhorEnvioStatus };
