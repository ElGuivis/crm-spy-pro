import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { createLogger } from '@/lib/logger';
const log = createLogger('useAutomationsData');

export interface CashbackConfigData {
  id: string;
  name: string;
  discount_percentage: number;
  coupon_duration_days: number;
  integration_name: string;
  integration_id: string | null;
  min_purchase_value: number | null;
  max_discount_value: number | null;
  trigger_statuses: string[] | null;
  webhook_url: string | null;
  whatsapp_integration_id: string | null;
  is_active: boolean;
  send_via_whatsapp: boolean | null;
  message_template: string | null;
  created_at: string;
}

export interface OrderNotificationConfigData {
  id: string;
  name: string;
  integration_id: string | null;
  is_active: boolean;
  created_at: string;
  rules_count?: number;
}

export interface BirthdayConfigData {
  id: string;
  name: string;
  integration_id: string;
  coupon_discount_percent: number;
  coupon_duration_days: number;
  is_active: boolean;
  created_at: string;
}

export interface ReactivationConfigData {
  id: string;
  name: string;
  integration_id: string | null;
  whatsapp_integration_id: string | null;
  inactivity_days: number;
  coupon_discount_percent: number;
  coupon_duration_days: number;
  is_active: boolean;
  activated_at: string | null;
  created_at: string;
}

export function useAutomationsData() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);

  // Cashback
  const [cashbackConfigs, setCashbackConfigs] = useState<CashbackConfigData[]>([]);
  const [couponsCount, setCouponsCount] = useState<Record<string, number>>({});
  const [lastExecution, setLastExecution] = useState('Nunca');

  // Order Notification
  const [orderNotificationConfigs, setOrderNotificationConfigs] = useState<OrderNotificationConfigData[]>([]);
  const [orderNotificationStats, setOrderNotificationStats] = useState({ total: 0, lastExecution: 'Nunca' });

  // Birthday
  const [birthdayConfigs, setBirthdayConfigs] = useState<BirthdayConfigData[]>([]);
  const [birthdayStats, setBirthdayStats] = useState({ total: 0, lastExecution: 'Nunca' });

  // Reactivation
  const [reactivationConfigs, setReactivationConfigs] = useState<ReactivationConfigData[]>([]);
  const [reactivationStats, setReactivationStats] = useState({ total: 0, lastExecution: 'Nunca' });

  const loadCashbackData = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: configs, error: configsError } = await supabase
        .from('cashback_configs')
        .select('id, name, discount_percentage, coupon_duration_days, integration_name, integration_id, min_purchase_value, max_discount_value, trigger_statuses, webhook_url, whatsapp_integration_id, is_active, send_via_whatsapp, message_template, created_at')
        .order('created_at', { ascending: false });
      if (configsError) throw configsError;
      setCashbackConfigs(configs || []);

      const { data: coupons, error: couponsError } = await supabase
        .from('generated_coupons')
        .select('config_id');
      if (!couponsError && coupons) {
        const counts: Record<string, number> = {};
        coupons.forEach(coupon => {
          if (coupon.config_id) counts[coupon.config_id] = (counts[coupon.config_id] || 0) + 1;
        });
        setCouponsCount(counts);
      }

      const { data: lastCoupon, error: lastCouponError } = await supabase
        .from('generated_coupons')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!lastCouponError && lastCoupon) {
        setLastExecution(formatDistanceToNow(new Date(lastCoupon.created_at), { addSuffix: true, locale: ptBR }));
      }
    } catch (error) {
      log.error('Error loading cashback data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOrderNotificationData = useCallback(async () => {
    try {
      const { data: configs, error: configsError } = await supabase
        .from('order_notification_configs')
        .select('id, name, integration_id, is_active, created_at')
        .order('created_at', { ascending: false });
      if (configsError) throw configsError;
      setOrderNotificationConfigs(configs || []);

      const { data: executions, error: execError } = await supabase
        .from('order_notification_executions')
        .select('created_at')
        .order('created_at', { ascending: false });
      if (!execError && executions) {
        setOrderNotificationStats({
          total: executions.length,
          lastExecution: executions[0]
            ? formatDistanceToNow(new Date(executions[0].created_at), { addSuffix: true, locale: ptBR })
            : 'Nunca',
        });
      }
    } catch (error) {
      log.error('Error loading order notification data:', error);
    }
  }, []);

  const loadBirthdayData = useCallback(async () => {
    try {
      const { data: configs, error: configsError } = await supabase
        .from('birthday_configs')
        .select('id, name, integration_id, coupon_discount_percent, coupon_duration_days, is_active, created_at')
        .order('created_at', { ascending: false });
      if (configsError) throw configsError;
      setBirthdayConfigs((configs || []) as BirthdayConfigData[]);

      const { data: executions, error: execError } = await supabase
        .from('birthday_executions')
        .select('created_at')
        .order('created_at', { ascending: false });
      if (!execError && executions) {
        setBirthdayStats({
          total: executions.length,
          lastExecution: executions[0]
            ? formatDistanceToNow(new Date(executions[0].created_at), { addSuffix: true, locale: ptBR })
            : 'Nunca',
        });
      }
    } catch (error) {
      log.error('Error loading birthday data:', error);
    }
  }, []);

  const loadReactivationData = useCallback(async () => {
    try {
      const { data: configs, error: configsError } = await supabase
        .from('reactivation_configs')
        .select('id, name, integration_id, whatsapp_integration_id, inactivity_days, coupon_discount_percent, coupon_duration_days, is_active, activated_at, created_at')
        .order('created_at', { ascending: false });
      if (configsError) throw configsError;
      setReactivationConfigs((configs || []) as ReactivationConfigData[]);

      const { data: executions, error: execError } = await supabase
        .from('reactivation_executions')
        .select('created_at')
        .order('created_at', { ascending: false });
      if (!execError && executions) {
        setReactivationStats({
          total: executions.length,
          lastExecution: executions[0]
            ? formatDistanceToNow(new Date(executions[0].created_at), { addSuffix: true, locale: ptBR })
            : 'Nunca',
        });
      }
    } catch (error) {
      log.error('Error loading reactivation data:', error);
    }
  }, []);

  const deleteCashback = useCallback(async (id: string) => {
    try {
      await supabase.from('cashback_reminders').delete().eq('config_id', id);
      await supabase.from('generated_coupons').delete().eq('config_id', id);
      await supabase.from('cashback_executions').delete().eq('config_id', id);
      const { error } = await supabase.from('cashback_configs').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Configuração excluída', description: 'A automação de cashback foi removida com sucesso.' });
      loadCashbackData();
    } catch (error) {
      log.error('Error deleting cashback:', error);
      toast({ title: 'Erro ao excluir', description: 'Não foi possível excluir a configuração de cashback.', variant: 'destructive' });
    }
  }, [toast, loadCashbackData]);

  useEffect(() => {
    loadCashbackData();
    loadOrderNotificationData();
    loadBirthdayData();
    loadReactivationData();
  }, [loadCashbackData, loadOrderNotificationData, loadBirthdayData, loadReactivationData]);

  const totalCoupons = Object.values(couponsCount).reduce((a, b) => a + b, 0);
  const activeConfigs = cashbackConfigs.filter(c => c.is_active).length;

  return {
    isLoading,
    cashbackConfigs, couponsCount, lastExecution, totalCoupons, activeConfigs,
    orderNotificationConfigs, orderNotificationStats,
    birthdayConfigs, birthdayStats,
    reactivationConfigs, reactivationStats,
    loadCashbackData, loadOrderNotificationData, loadBirthdayData, loadReactivationData,
    deleteCashback,
  };
}
