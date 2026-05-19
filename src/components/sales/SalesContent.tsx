import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { SyncProgressBanner } from "@/components/common/SyncProgressBanner";
import { LIOrderDetailsDialog } from "./LIOrderDetailsDialog";
import { Progress } from "@/components/ui/progress";
import { useExport } from "@/hooks/useExport";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { createLogger } from '@/lib/logger';

import { OrderView, SyncStats, SalesContentProps, LI_ORDER_SELECT } from "./sales-types";
import { mapOrder, getMostRecentSync, formatLastSync, formatCurrency } from "./sales-helpers";
import { SalesHeader } from "./SalesHeader";
import { SalesFiltersCard } from "./SalesFiltersCard";
import { SalesOrdersTable } from "./SalesOrdersTable";

const log = createLogger('SalesContent');

export function SalesContent({ integrationId }: SalesContentProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { syncStatus, startSync } = useSyncStatus(integrationId, 'orders');
  const { exportToCSV, exportToPDF, isExporting } = useExport();

  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingNew, setCheckingNew] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [integrationName, setIntegrationName] = useState("");
  const [stats, setStats] = useState<SyncStats>({ orders: 0, lastOrdersSync: null });
  const [selectedOrder, setSelectedOrder] = useState<OrderView | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getDateRange = useCallback((): { from: string; to: string } | null => {
    const now = new Date();
    switch (dateFilter) {
      case '7d': return { from: subDays(now, 7).toISOString(), to: now.toISOString() };
      case '30d': return { from: subDays(now, 30).toISOString(), to: now.toISOString() };
      case '90d': return { from: subDays(now, 90).toISOString(), to: now.toISOString() };
      case 'custom':
        if (dateFrom && dateTo) return { from: startOfDay(dateFrom).toISOString(), to: endOfDay(dateTo).toISOString() };
        if (dateFrom) return { from: startOfDay(dateFrom).toISOString(), to: now.toISOString() };
        return null;
      default: return null;
    }
  }, [dateFilter, dateFrom, dateTo]);

  const buildFilteredQuery = useCallback((base: any) => {
    let q = base.eq('integration_id', integrationId);
    if (statusFilter && statusFilter !== 'all') q = q.eq('status_name', statusFilter);
    const range = getDateRange();
    if (range) q = q.gte('created_at_remote', range.from).lte('created_at_remote', range.to);
    return q;
  }, [integrationId, statusFilter, getDateRange]);

  const fetchAvailableStatuses = async () => {
    const { data } = await supabase.from('li_orders').select('status_name').eq('integration_id', integrationId).not('status_name', 'is', null);
    if (data) {
      const unique = [...new Set(data.map(d => d.status_name).filter(Boolean))] as string[];
      setAvailableStatuses(unique.sort());
    }
  };

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const from = currentPage * pageSize;
      const to = from + pageSize - 1;
      const q = buildFilteredQuery(supabase.from('li_orders').select(LI_ORDER_SELECT, { count: 'exact' }))
        .order('created_at_remote', { ascending: false }).range(from, to);
      const { data, error, count } = await q;
      if (error) throw error;
      setOrders((data || []).map(d => mapOrder(d)));
      setTotalOrders(count || 0);
    } catch (error) {
      log.error('Error fetching orders:', error);
      toast({ title: "Erro ao carregar pedidos", description: "Não foi possível carregar os pedidos.", variant: "destructive" });
    } finally { setLoading(false); }
  }, [currentPage, pageSize, buildFilteredQuery]);

  const silentRefresh = useCallback(async () => {
    try {
      const from = currentPage * pageSize;
      const q = buildFilteredQuery(supabase.from('li_orders').select(LI_ORDER_SELECT, { count: 'exact' }))
        .order('created_at_remote', { ascending: false }).range(from, from + pageSize - 1);
      const { data, error, count } = await q;
      if (!error && data) { setOrders(data.map(d => mapOrder(d))); setTotalOrders(count || 0); }
    } catch (error) { log.error('Error in silent refresh:', error); }
  }, [currentPage, pageSize, buildFilteredQuery]);

  const fetchStats = async () => {
    try {
      const [ordersResult, integrationResult] = await Promise.all([
        supabase.from('li_orders').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId),
        supabase.from('integrations').select('last_sync_at, last_sync_orders_at, last_orders_sync_at').eq('id', integrationId).single()
      ]);
      setStats({ orders: ordersResult.count || 0, lastOrdersSync: integrationResult.data ? getMostRecentSync(integrationResult.data) : null });
    } catch (error) { log.error('Error fetching stats:', error); }
  };

  const fetchIntegrationName = async () => {
    const { data } = await supabase.from('integrations').select('name, last_sync_at, last_sync_orders_at, last_orders_sync_at').eq('id', integrationId).single();
    if (data) { setIntegrationName(data.name); setStats(prev => ({ ...prev, lastOrdersSync: getMostRecentSync(data) })); }
  };

  useEffect(() => { fetchOrders(); fetchStats(); fetchIntegrationName(); fetchAvailableStatuses(); }, [integrationId]);
  useEffect(() => { setCurrentPage(0); }, [statusFilter, dateFilter, dateFrom, dateTo]);
  useEffect(() => { fetchOrders(); }, [currentPage, pageSize, statusFilter, dateFilter, dateFrom, dateTo]);

  useEffect(() => {
    const channel = supabase.channel(`orders-${integrationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'li_orders', filter: `integration_id=eq.${integrationId}` }, () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => { silentRefresh(); fetchStats(); }, 500);
      }).subscribe();
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); supabase.removeChannel(channel); };
  }, [integrationId, silentRefresh]);

  useEffect(() => {
    if (syncStatus.status === 'completed') {
      fetchOrders(); fetchStats();
      supabase.from('integrations').update({ last_orders_sync_at: new Date().toISOString(), initial_sync_completed: true }).eq('id', integrationId);
    }
  }, [syncStatus.status, integrationId]);

  const handleSync = async () => {
    try { toast({ title: "Sincronização iniciada", description: "Sincronizando pedidos em segundo plano..." }); await startSync(); }
    catch (error: any) { log.error('Sync error:', error); toast({ title: "Erro na sincronização", description: error.message || "Não foi possível iniciar.", variant: "destructive" }); }
  };

  const handleCheckNewOrders = async () => {
    try {
      setCheckingNew(true);
      toast({ title: "Verificando novos pedidos", description: "Buscando pedidos novos..." });
      const { error } = await supabase.functions.invoke('li-reconciliation-processor', { body: { manual: true, integrationId, syncType: 'orders' } });
      if (error) throw error;
      await Promise.all([fetchOrders(), fetchStats()]);
      toast({ title: "Verificação concluída", description: "Pedidos atualizados." });
    } catch (error: any) {
      log.error('Check new orders error:', error);
      toast({ title: "Erro ao verificar", description: error.message || "Erro.", variant: "destructive" });
    } finally { setCheckingNew(false); }
  };

  const viewOrderDetails = async (order: OrderView) => {
    try {
      const { data: items, error } = await supabase.from('li_order_items').select('id, name, sku, qty, price, raw_json').eq('order_id', order.id);
      if (error) throw error;
      setSelectedOrder({ ...order, items: (items || []).map(i => ({ id: i.id, name: i.name, sku: i.sku, qty: i.qty, price: i.price, raw_json: i.raw_json })) });
      setDetailsDialogOpen(true);
    } catch (error) { log.error('Error fetching order items:', error); toast({ title: "Erro", description: "Não foi possível carregar os detalhes.", variant: "destructive" }); }
  };

  const handleExportCSV = () => {
    const headers = ['Pedido', 'Cliente', 'Email', 'Status', 'Subtotal', 'Frete', 'Total', 'Data'];
    const data = orders.map(order => [order.order_number, order.customer_name || '', order.customer_email || '', order.status_name || '', order.valor_subtotal || 0, order.valor_frete || 0, order.valor_total || 0, order.created_at_remote ? format(new Date(order.created_at_remote), "dd/MM/yyyy HH:mm") : '']);
    exportToCSV({ filename: `pedidos-${integrationName}`, headers, data });
  };

  const handleExportPDF = () => {
    const headers = ['Pedido', 'Cliente', 'Status', 'Total', 'Data'];
    const data = orders.map(order => [`#${order.order_number}`, order.customer_name || 'N/A', order.status_name || 'N/A', formatCurrency(order.valor_total), order.created_at_remote ? format(new Date(order.created_at_remote), "dd/MM/yyyy") : '-']);
    exportToPDF({ filename: `pedidos-${integrationName}`, headers, data, title: `Relatório de Pedidos - ${integrationName}` });
  };

  return (
    <div className="space-y-6 p-6">
      <SyncProgressBanner integrationId={integrationId} entityType="orders" />

      <SalesHeader
        integrationId={integrationId}
        integrationName={integrationName}
        checkingNew={checkingNew}
        syncStatus={syncStatus}
        isExporting={isExporting}
        ordersCount={orders.length}
        onBack={() => navigate('/sales')}
        onCheckNewOrders={handleCheckNewOrders}
        onSync={handleSync}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
        onDeleted={() => { fetchOrders(); fetchStats(); }}
      />

      {syncStatus.isActive && syncStatus.progress.total > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Sincronizando pedidos...</span>
                <span>{syncStatus.progress.saved} de {syncStatus.progress.total}</span>
              </div>
              <Progress value={(syncStatus.progress.saved / syncStatus.progress.total) * 100} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pedidos</p>
                <p className="text-2xl font-bold">{stats.orders}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Última Sincronização</p>
                <p className="text-sm font-medium">{formatLastSync(stats.lastOrdersSync)}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <SalesFiltersCard
        statusFilter={statusFilter}
        dateFilter={dateFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        availableStatuses={availableStatuses}
        showFilters={showFilters}
        onStatusChange={setStatusFilter}
        onDateFilterChange={setDateFilter}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onToggleFilters={() => setShowFilters(v => !v)}
        onClearFilters={() => { setStatusFilter('all'); setDateFilter('all'); setDateFrom(undefined); setDateTo(undefined); }}
      />

      <SalesOrdersTable
        orders={orders}
        loading={loading}
        totalOrders={totalOrders}
        searchTerm={searchTerm}
        currentPage={currentPage}
        pageSize={pageSize}
        syncIsActive={syncStatus.isActive}
        onSearchChange={setSearchTerm}
        onViewDetails={viewOrderDetails}
        onSync={handleSync}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(0); }}
      />

      <LIOrderDetailsDialog order={selectedOrder} open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen} />
    </div>
  );
}
