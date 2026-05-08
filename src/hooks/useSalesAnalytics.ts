import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subDays, format } from "date-fns";

export interface SalesAnalyticsData {
  revenueByChannel: { name: string; revenue: number; orders: number }[];
  ticketEvolution: { date: string; ticket: number }[];
  topProducts: { name: string; revenue: number; quantity: number }[];
  conversionFunnel: { stage: string; value: number }[];
  totalRevenue: number;
  totalOrders: number;
  avgTicket: number;
}

const EFFECTIVE_STATUSES = ["Pedido Entregue", "Pedido Enviado", "Pedido Pago"];

async function fetchSalesAnalytics(tenantId: string): Promise<SalesAnalyticsData> {
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

  const [
    { data: liOrders },
    { data: blingOrders },
    { data: liItems },
    { data: blingItems },
  ] = await Promise.all([
    supabase.from("li_orders").select("id, created_at_remote, totals_json, status_name").eq("tenant_id", tenantId).gte("created_at_remote", thirtyDaysAgo).limit(1000),
    supabase.from("bling_orders").select("id, data_criacao, valor_total").eq("tenant_id", tenantId).gte("data_criacao", thirtyDaysAgo).limit(1000),
    supabase.from("li_order_items").select("name, qty, price, order_id").eq("tenant_id", tenantId).limit(1000),
    supabase.from("bling_order_items").select("produto_nome, quantidade, valor_total, order_id").eq("tenant_id", tenantId).limit(1000),
  ]);

  const effectiveLI = (liOrders || []).filter(o => EFFECTIVE_STATUSES.includes(o.status_name || ""));
  const effectiveBling = blingOrders || [];
  const getLITotal = (o: typeof effectiveLI[number]): number => {
    const totals = o.totals_json as any | null;
    return Number(totals?.total || 0);
  };

  const liRevenue = effectiveLI.reduce((sum, o) => sum + getLITotal(o), 0);
  const blingRevenue = effectiveBling.reduce((sum, o) => sum + Number(o.valor_total || 0), 0);
  const revenueByChannel: SalesAnalyticsData["revenueByChannel"] = [];
  if (liRevenue > 0) revenueByChannel.push({ name: "Loja Integrada", revenue: liRevenue, orders: effectiveLI.length });
  if (blingRevenue > 0) revenueByChannel.push({ name: "Bling", revenue: blingRevenue, orders: effectiveBling.length });

  const totalRevenue = liRevenue + blingRevenue;
  const totalOrders = effectiveLI.length + effectiveBling.length;

  // Ticket evolution (14 days)
  const ticketMap: Record<string, { total: number; count: number }> = {};
  for (let i = 13; i >= 0; i--) ticketMap[format(subDays(new Date(), i), "yyyy-MM-dd")] = { total: 0, count: 0 };
  for (const o of effectiveLI) {
    const d = format(new Date(o.created_at_remote), "yyyy-MM-dd");
    if (ticketMap[d]) { ticketMap[d].total += getLITotal(o); ticketMap[d].count++; }
  }
  for (const o of effectiveBling) {
    const d = format(new Date(o.data_criacao), "yyyy-MM-dd");
    if (ticketMap[d]) { ticketMap[d].total += Number(o.valor_total || 0); ticketMap[d].count++; }
  }

  // Top products
  const productMap: Record<string, { revenue: number; quantity: number }> = {};
  const liOrderIds = new Set(effectiveLI.map(o => o.id));
  for (const item of liItems || []) {
    if (!liOrderIds.has(item.order_id)) continue;
    const name = item.name || "Sem nome";
    if (!productMap[name]) productMap[name] = { revenue: 0, quantity: 0 };
    productMap[name].revenue += (item.price || 0) * (item.qty || 0);
    productMap[name].quantity += item.qty || 0;
  }
  const blingOrderIds = new Set(effectiveBling.map(o => o.id));
  for (const item of blingItems || []) {
    if (!blingOrderIds.has(item.order_id)) continue;
    const name = item.produto_nome || "Sem nome";
    if (!productMap[name]) productMap[name] = { revenue: 0, quantity: 0 };
    productMap[name].revenue += item.valor_total || 0;
    productMap[name].quantity += item.quantidade || 0;
  }

  const allOrdersCount = (liOrders || []).length + (blingOrders || []).length;

  return {
    revenueByChannel,
    ticketEvolution: Object.entries(ticketMap).map(([date, v]) => ({ date, ticket: v.count > 0 ? Math.round(v.total / v.count) : 0 })),
    topProducts: Object.entries(productMap).map(([name, v]) => ({ name: name.substring(0, 30), ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    conversionFunnel: [
      { stage: "Pedidos Totais", value: allOrdersCount },
      { stage: "Pedidos Efetivos", value: totalOrders },
      { stage: "Entregues", value: effectiveLI.filter(o => o.status_name === "Pedido Entregue").length + effectiveBling.length },
    ],
    totalRevenue,
    totalOrders,
    avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
  };
}

export function useSalesAnalytics() {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ["sales-analytics", tenantId],
    queryFn: () => fetchSalesAnalytics(tenantId!),
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}
