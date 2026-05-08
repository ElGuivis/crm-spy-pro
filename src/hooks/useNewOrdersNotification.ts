import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWebNotifications } from '@/hooks/useWebNotifications';

import { createLogger } from '@/lib/logger';
const log = createLogger('useNewOrdersNotification');

export function useNewOrdersNotification() {
  const { toast } = useToast();
  const { notifyNewOrder, permission, requestPermission, updateBadge } = useWebNotifications();
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [lastSeenOrderId, setLastSeenOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (permission === 'default') {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    const stored = localStorage.getItem('lastSeenOrderId');
    if (stored) setLastSeenOrderId(stored);
  }, []);

  // Subscribe to new orders - use new schema columns
  useEffect(() => {
    const channel = supabase
      .channel('new-orders-notification')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'li_orders' },
        (payload) => {
          log.info('New order received:', payload);
          setNewOrdersCount(prev => prev + 1);
          
          const newOrder = payload.new as any;
          const raw = newOrder.raw_json || {};
          const totals = newOrder.totals_json || {};
          
          toast({
            title: '🛒 Novo pedido!',
            description: `Pedido #${newOrder.order_number || 'N/A'} - ${raw.cliente_nome || 'Cliente'}`,
          });

          notifyNewOrder(
            newOrder.order_number || 'N/A',
            raw.cliente_nome || 'Cliente',
            totals.total
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [toast]);

  // Check for unseen orders - use updated_at_local instead of created_at
  useEffect(() => {
    const checkUnseenOrders = async () => {
      if (!lastSeenOrderId) {
        const { data } = await supabase
          .from('li_orders')
          .select('id')
          .order('updated_at_local', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (data) {
          setLastSeenOrderId(data.id);
          localStorage.setItem('lastSeenOrderId', data.id);
        }
        return;
      }

      const { data: lastSeenOrder } = await supabase
        .from('li_orders')
        .select('updated_at_local')
        .eq('id', lastSeenOrderId)
        .maybeSingle();

      if (lastSeenOrder) {
        const { count } = await supabase
          .from('li_orders')
          .select('id', { count: 'exact', head: true })
          .gt('updated_at_local', lastSeenOrder.updated_at_local);
        
        setNewOrdersCount(count || 0);
        updateBadge(count || 0);
      }
    };

    checkUnseenOrders();
  }, [lastSeenOrderId]);

  const markAllAsSeen = useCallback(async () => {
    const { data } = await supabase
      .from('li_orders')
      .select('id')
      .order('updated_at_local', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (data) {
      setLastSeenOrderId(data.id);
      localStorage.setItem('lastSeenOrderId', data.id);
      setNewOrdersCount(0);
    }
  }, []);

  return { newOrdersCount, markAllAsSeen };
}
