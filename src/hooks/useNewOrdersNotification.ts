import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWebNotifications, isNotificationEnabled } from '@/hooks/useWebNotifications';
import {
  type AnnouncedOrderRow,
  isRecentOrder,
  isIncompleteOrder,
  orderNumberOf,
  customerNameOf,
} from '@/hooks/new-order-announce';

import { createLogger } from '@/lib/logger';
const log = createLogger('useNewOrdersNotification');

const ORDER_COLUMNS = 'id, order_number, loja_integrada_order_id, created_at_remote, raw_json, totals_json';
const COMPLETE_ORDER_DELAY_MS = 5000;
const UNSEEN_WINDOW_DAYS = 7;

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

  // Assina novos pedidos. Só avisa pedido REALMENTE novo e completo: a sincronização do histórico também
  // insere pedidos (antigos) e eles chegam primeiro sem número/cliente, o que gerava "Pedido #N/A - Cliente".
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const announce = (order: AnnouncedOrderRow) => {
      const number = orderNumberOf(order);
      if (number === null || !isRecentOrder(order)) return;
      setNewOrdersCount(prev => prev + 1);
      if (isNotificationEnabled('new_order')) {
        toast({ title: '🛒 Novo pedido!', description: `Pedido #${number} - ${customerNameOf(order)}` });
      }
      notifyNewOrder(number, customerNameOf(order), order.totals_json?.total);
    };

    const channel = supabase
      .channel('new-orders-notification')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'li_orders' },
        (payload) => {
          const order = payload.new as AnnouncedOrderRow;
          log.info('Pedido inserido:', order.id);

          if (!isIncompleteOrder(order)) { announce(order); return; }

          // Veio incompleto: relê depois que a sincronização preencher os dados
          const timer = setTimeout(async () => {
            timers.delete(timer);
            const { data } = await supabase.from('li_orders').select(ORDER_COLUMNS).eq('id', order.id).maybeSingle();
            if (data) announce(data as AnnouncedOrderRow);
          }, COMPLETE_ORDER_DELAY_MS);
          timers.add(timer);
        }
      )
      .subscribe();

    return () => {
      timers.forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [toast, notifyNewOrder]);

  // Pedidos não vistos: só os recentes (a importação do histórico não deve virar "milhares de novos")
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
        const since = new Date(Date.now() - UNSEEN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from('li_orders')
          .select('id', { count: 'exact', head: true })
          .gt('updated_at_local', lastSeenOrder.updated_at_local)
          .gte('created_at_remote', since);

        setNewOrdersCount(count || 0);
        updateBadge(count || 0);
      }
    };

    checkUnseenOrders();
  }, [lastSeenOrderId, updateBadge]);

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
