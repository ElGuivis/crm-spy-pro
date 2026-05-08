import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';
import { getIntegrationLogoUrl } from '@/lib/integration-logos';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Dashboard');

interface SalesData {
  date: string;
  total: number;
  count: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface BulkCampaignStats {
  totalCampaigns: number;
  totalSent: number;
  totalDelivered: number;
  successRate: number;
}

interface AutomationBreakdown {
  cashback: number;
  orderNotifications: number;
}

interface RFMSegmentSummary {
  segment_name: string;
  count: number;
}

interface EnhancedDashboardStats {
  activeConversations: number;
  totalContacts: number;
  activeAutomations: number;
  aiResponseRate: number;
  newContactsThisMonth: number;
  conversationChange: number;
  totalShipments: number;
  shipmentsInTransit: number;
  shipmentsDeliveredThisMonth: number;
  shipmentsDelivered30d: number;
  shipmentsDelayed: number;
  salesData7d: SalesData[];
  salesData30d: SalesData[];
  topProducts: TopProduct[];
  topProducts30d: TopProduct[];
  totalRevenueThisMonth: number;
  totalOrdersThisMonth: number;
  revenueChange: number;
  avgTicket: number;
  totalRevenue30d: number;
  totalOrders30d: number;
  bulkCampaignStats: BulkCampaignStats;
  automationBreakdown: AutomationBreakdown;
  msgsSent30d: number;
  msgsReceived30d: number;
  rfmSummary: RFMSegmentSummary[];
  isLoading: boolean;
}

interface Integration {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'pending' | 'disconnected';
  description: string;
  logo: string;
}

// Logos are now managed centrally via src/lib/integration-logos.ts

const integrationNames: Record<string, string> = {
  'loja_integrada': 'Loja Integrada',
  'whatsapp': 'WhatsApp Business',
  'evolution': 'WhatsApp (Evolution)',
  'melhor_envio': 'Melhor Envio',
  'nuvemshop': 'Nuvem Shop',
  'chatwoot': 'Chatwoot',
  'email': 'Email',
  'bling': 'Bling ERP',
};

export function useDashboardStats(): EnhancedDashboardStats {
  const { tenantId } = useAuth();
  const [stats, setStats] = useState<EnhancedDashboardStats>({
    activeConversations: 0,
    totalContacts: 0,
    activeAutomations: 0,
    aiResponseRate: 0,
    newContactsThisMonth: 0,
    conversationChange: 0,
    totalShipments: 0,
    shipmentsInTransit: 0,
    shipmentsDeliveredThisMonth: 0,
    shipmentsDelivered30d: 0,
    shipmentsDelayed: 0,
    salesData7d: [],
    salesData30d: [],
    topProducts: [],
    topProducts30d: [],
    totalRevenueThisMonth: 0,
    totalOrdersThisMonth: 0,
    revenueChange: 0,
    avgTicket: 0,
    totalRevenue30d: 0,
    totalOrders30d: 0,
    bulkCampaignStats: { totalCampaigns: 0, totalSent: 0, totalDelivered: 0, successRate: 0 },
    automationBreakdown: { cashback: 0, orderNotifications: 0 },
    msgsSent30d: 0,
    msgsReceived30d: 0,
    rfmSummary: [],
    isLoading: true,
  });

  useEffect(() => {
    if (!tenantId) return;

    const fetchStats = async () => {
      try {
        const now = new Date();
        const startOfThisMonth = startOfMonth(now);
        const startOfLastMonth = startOfMonth(subMonths(now, 1));
        const endOfLastMonth = endOfMonth(subMonths(now, 1));
        const thirtyDaysAgoStr = subDays(now, 30).toISOString();

        // === Parallel: RPC + basic counts ===
        const [
          rpcResult,
          { count: activeConversations },
          { count: totalContacts },
          { count: newContactsThisMonth },
          { count: cashbackAutomations },
          { count: orderNotifAutomations },
          { data: aiLogs },
          { count: lastMonthConversations },
          { count: thisMonthConversations },
          { count: totalShipments },
          { count: shipmentsInTransit },
          { count: shipmentsDeliveredThisMonth },
          { count: shipmentsDelayed },
          { data: bulkCampaignsData },
        ] = await Promise.all([
          // RPC for accurate revenue, sales, top products, messages, RFM
          supabase.rpc('get_dashboard_stats', { _tenant_id: tenantId }),
          supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['bot', 'human']),
          supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
          supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', startOfThisMonth.toISOString()),
          supabase.from('cashback_configs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true),
          supabase.from('order_notification_configs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true),
          supabase.from('ai_usage_logs').select('status').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgoStr),
          supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', startOfLastMonth.toISOString()).lte('created_at', endOfLastMonth.toISOString()),
          supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', startOfThisMonth.toISOString()),
          supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
          supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['in_transit', 'posted']),
          supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'delivered').gte('delivered_at', startOfThisMonth.toISOString()),
          supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('status', 'in', '("delivered","canceled")').not('estimated_delivery_at', 'is', null).lt('estimated_delivery_at', now.toISOString()),
          supabase.from('bulk_campaigns').select('sent_count, delivered_count, failed_count, status').eq('tenant_id', tenantId).gte('created_at', startOfThisMonth.toISOString()),
        ]);

        // Parse RPC result
        interface DashboardRpcResult {
          total_revenue_this_month?: number;
          total_orders_this_month?: number;
          revenue_change?: number;
          avg_ticket?: number;
          msgs_sent_30d?: number;
          msgs_received_30d?: number;
          rfm_summary?: { segment_name: string; count: number }[];
          sales_by_day?: { date: string; total: number; count: number }[];
          top_products?: { name: string; quantity: number; revenue: number }[];
          top_products_30d?: { name: string; quantity: number; revenue: number }[];
          me_delivered_this_month?: number;
          me_delivered_30d?: number;
        }
        const rpc: DashboardRpcResult = (rpcResult.data as DashboardRpcResult) || {};
        const totalRevenueThisMonth = Number(rpc.total_revenue_this_month || 0);
        const totalOrdersThisMonth = Number(rpc.total_orders_this_month || 0);
        const revenueChange = Number(rpc.revenue_change || 0);
        const avgTicket = Number(rpc.avg_ticket || 0);
        const msgsSent30d = Number(rpc.msgs_sent_30d || 0);
        const msgsReceived30d = Number(rpc.msgs_received_30d || 0);
        const rfmSummary: RFMSegmentSummary[] = (rpc.rfm_summary || []).map((r) => ({
          segment_name: r.segment_name,
          count: Number(r.count),
        }));

        // Sales by day from RPC
        const salesByDayRaw: { date: string; total: number; count: number }[] = (rpc.sales_by_day || []).map((r) => ({
          date: r.date,
          total: Number(r.total || 0),
          count: Number(r.count || 0),
        }));
        const salesData30d = salesByDayRaw;
        const salesData7d = salesByDayRaw.slice(-7);

        // Calculate 30-day totals from sales_by_day
        const totalRevenue30d = salesByDayRaw.reduce((sum, d) => sum + d.total, 0);
        const totalOrders30d = salesByDayRaw.reduce((sum, d) => sum + d.count, 0);

        // Top products from RPC
        const topProducts: TopProduct[] = (rpc.top_products || []).map((r) => ({
          name: r.name,
          quantity: Number(r.quantity || 0),
          revenue: Number(r.revenue || 0),
        }));
        const topProducts30d: TopProduct[] = (rpc.top_products_30d || []).map((r) => ({
          name: r.name,
          quantity: Number(r.quantity || 0),
          revenue: Number(r.revenue || 0),
        }));
        const meDeliveredThisMonth = Number(rpc.me_delivered_this_month || 0);
        const meDelivered30d = Number(rpc.me_delivered_30d || 0);

        // Automations
        const automationBreakdown = {
          cashback: cashbackAutomations || 0,
          orderNotifications: orderNotifAutomations || 0,
        };
        const activeAutomations = automationBreakdown.cashback + automationBreakdown.orderNotifications;

        // AI success rate
        let aiResponseRate = 0;
        if (aiLogs && aiLogs.length > 0) {
          const successLogs = aiLogs.filter(log => log.status === 'success');
          aiResponseRate = Math.round((successLogs.length / aiLogs.length) * 100);
        }

        // Conversation change
        let conversationChange = 0;
        if (lastMonthConversations && lastMonthConversations > 0) {
          conversationChange = Math.round(((thisMonthConversations || 0) - lastMonthConversations) / lastMonthConversations * 100);
        }


        // Bulk campaign stats
        const totalCampaigns = bulkCampaignsData?.length || 0;
        const totalSent = bulkCampaignsData?.reduce((sum, c) => sum + (c.sent_count || 0), 0) || 0;
        const totalDelivered = bulkCampaignsData?.reduce((sum, c) => sum + (c.delivered_count || 0), 0) || 0;
        const successRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;

        setStats({
          activeConversations: activeConversations || 0,
          totalContacts: totalContacts || 0,
          activeAutomations,
          aiResponseRate,
          newContactsThisMonth: newContactsThisMonth || 0,
          conversationChange,
          totalShipments: totalShipments || 0,
          shipmentsInTransit: shipmentsInTransit || 0,
          shipmentsDeliveredThisMonth: meDeliveredThisMonth || shipmentsDeliveredThisMonth || 0,
          shipmentsDelivered30d: meDelivered30d,
          shipmentsDelayed: shipmentsDelayed || 0,
          salesData7d,
          salesData30d,
          topProducts,
          topProducts30d,
          totalRevenueThisMonth,
          totalOrdersThisMonth,
          revenueChange,
          avgTicket,
          totalRevenue30d,
          totalOrders30d,
          bulkCampaignStats: { totalCampaigns, totalSent, totalDelivered, successRate },
          automationBreakdown,
          msgsSent30d,
          msgsReceived30d,
          rfmSummary,
          isLoading: false,
        });
      } catch (error) {
        logger.error('Error fetching dashboard stats', error);
        setStats(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchStats();

    // Realtime subscriptions with debounce
    const debounceRef = { timer: null as ReturnType<typeof setTimeout> | null };
    const debouncedRefresh = () => {
      if (debounceRef.timer) clearTimeout(debounceRef.timer);
      debounceRef.timer = setTimeout(() => {
        logger.debug('Realtime change detected, refreshing stats');
        fetchStats();
      }, 2000);
    };

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'li_orders' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bling_orders' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'me_shipments' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (debounceRef.timer) clearTimeout(debounceRef.timer);
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  return stats;
}

export function useDashboardIntegrations() {
  const { tenantId } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    const fetchIntegrations = async () => {
      try {
        const { data } = await supabase.from('integrations').select('id, name, type, status').eq('tenant_id', tenantId).order('created_at', { ascending: false });
        if (data) {
          const mappedIntegrations: Integration[] = data.map(int => ({
            id: int.id,
            name: int.name || integrationNames[int.type] || int.type,
            type: int.type,
            status: int.status === 'connected' ? 'connected' : int.status === 'error' ? 'disconnected' : 'pending',
            description: int.status === 'connected' ? 'Conexão ativa' : int.status === 'error' ? 'Erro na conexão' : 'Pendente de configuração',
            logo: getIntegrationLogoUrl(int.type) || 'https://cdn-icons-png.flaticon.com/512/2920/2920277.png',
          }));
          setIntegrations(mappedIntegrations);
        }
      } catch (error) {
        logger.error('Error fetching integrations', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchIntegrations();
  }, [tenantId]);

  return { integrations, isLoading };
}
