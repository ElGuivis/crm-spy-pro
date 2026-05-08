import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CohortRow {
  cohort: string; // YYYY-MM
  cohortSize: number;
  retention: Record<string, number>; // key = "30d", "60d", etc. value = percentage
}

const RETENTION_WINDOWS = [
  { key: '30d', days: 30, label: '30 dias' },
  { key: '60d', days: 60, label: '60 dias' },
  { key: '90d', days: 90, label: '90 dias' },
  { key: '180d', days: 180, label: '180 dias' },
  { key: '365d', days: 365, label: '12 meses' },
];

export function useRFMCohort(integrationId: string, sourceType: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['rfm-cohort', integrationId, sourceType],
    queryFn: async () => {
      // Fetch all paid orders with customer_id and date
      let orders: { customer_id: string; order_date: string }[] = [];

      if (sourceType === 'loja_integrada') {
        const paidStatuses = ['Pedido Pago', 'Pedido Enviado', 'Pedido Entregue'];
        
        // Fetch in pages to avoid 1000-row limit
        let allOrders: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data: batch, error } = await supabase
            .from('li_orders' as any)
            .select('customer_id, created_at_remote')
            .eq('integration_id', integrationId)
            .in('status_name', paidStatuses)
            .not('customer_id', 'is', null)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!batch || batch.length === 0) break;
          allOrders.push(...batch);
          if (batch.length < pageSize) break;
          from += pageSize;
        }

        orders = allOrders.map((o: any) => ({
          customer_id: o.customer_id,
          order_date: o.created_at_remote,
        })).filter(o => o.customer_id && o.order_date);

      } else if (sourceType === 'bling') {
        const paidKeywords = ['pago', 'faturado', 'enviado', 'entregue', 'atendido', 'completo'];
        
        let allOrders: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data: batch, error } = await supabase
            .from('bling_orders' as any)
            .select('cliente_id, data_criacao, situacao_nome')
            .eq('integration_id', integrationId)
            .not('cliente_id', 'is', null)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!batch || batch.length === 0) break;
          allOrders.push(...batch);
          if (batch.length < pageSize) break;
          from += pageSize;
        }

        orders = allOrders
          .filter((o: any) => {
            const status = (o.situacao_nome || '').toLowerCase();
            return paidKeywords.some(k => status.includes(k));
          })
          .map((o: any) => ({
            customer_id: String(o.cliente_id),
            order_date: o.data_criacao,
          }))
          .filter(o => o.customer_id && o.customer_id !== 'null' && o.order_date);
      }

      if (orders.length === 0) return [];

      // Group orders by customer
      const customerOrders = new Map<string, Date[]>();
      for (const o of orders) {
        const date = new Date(o.order_date);
        if (isNaN(date.getTime())) continue;
        if (!customerOrders.has(o.customer_id)) {
          customerOrders.set(o.customer_id, []);
        }
        customerOrders.get(o.customer_id)!.push(date);
      }

      // Sort each customer's orders
      for (const [, dates] of customerOrders) {
        dates.sort((a, b) => a.getTime() - b.getTime());
      }

      // Group by cohort (month of first purchase)
      const cohorts = new Map<string, { customers: Map<string, Date[]> }>();
      for (const [custId, dates] of customerOrders) {
        const firstDate = dates[0];
        const cohortKey = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}`;
        if (!cohorts.has(cohortKey)) {
          cohorts.set(cohortKey, { customers: new Map() });
        }
        cohorts.get(cohortKey)!.customers.set(custId, dates);
      }

      // Calculate retention for each cohort
      const cohortRows: CohortRow[] = [];
      const sortedCohorts = [...cohorts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

      for (const [cohortKey, cohortData] of sortedCohorts) {
        const cohortSize = cohortData.customers.size;
        const retention: Record<string, number> = {};

        for (const window of RETENTION_WINDOWS) {
          let retained = 0;
          for (const [, dates] of cohortData.customers) {
            const firstPurchase = dates[0];
            const windowEnd = new Date(firstPurchase.getTime() + window.days * 24 * 60 * 60 * 1000);
            // Check if customer made another purchase after first purchase and within window
            const hasRepurchase = dates.some((d, i) => i > 0 && d <= windowEnd);
            if (hasRepurchase) retained++;
          }
          retention[window.key] = cohortSize > 0 ? Math.round((retained / cohortSize) * 1000) / 10 : 0;
        }

        cohortRows.push({ cohort: cohortKey, cohortSize, retention });
      }

      return cohortRows;
    },
    enabled: !!integrationId && !!sourceType,
  });

  return {
    cohorts: data || [],
    isLoading,
    retentionWindows: RETENTION_WINDOWS,
  };
}
