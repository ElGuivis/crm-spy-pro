import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  RefreshCw, 
  Search, 
  ShoppingCart, 
  Eye,
  Clock,
  Zap,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Truck,
  Tag,
  Download,
  FileText
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { LIOrderDetailsDialog } from "./LIOrderDetailsDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, formatDistanceToNow, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { useExport } from "@/hooks/useExport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Filter, X } from "lucide-react";
import { Tables, Json } from "@/integrations/supabase/types";

import { createLogger } from '@/lib/logger';
const log = createLogger('SalesContent');

type DBOrder = Tables<'li_orders'>;
type DBOrderItem = Tables<'li_order_items'>;

const LI_ORDER_SELECT = 'id, order_number, status_name, status_id, totals_json, payment_json, shipping_json, raw_json, items_json, created_at_remote, updated_at_remote';

// Helper to safely extract from JSONB
const getJson = (json: Json | null, key: string): any => {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return (json as any)[key] ?? null;
};

// View model for display
interface OrderView {
  id: string;
  order_number: string;
  status_name: string | null;
  status_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_doc: string | null;
  valor_subtotal: number | null;
  valor_desconto: number | null;
  valor_frete: number | null;
  valor_total: number | null;
  created_at_remote: string | null;
  updated_at_remote: string | null;
  // Payment
  forma_pagamento: string | null;
  pagamento_tipo: string | null;
  pagamento_parcelas: number | null;
  pagamento_bandeira: string | null;
  pagamento_codigo: string | null;
  gateway_pagamento: string | null;
  transacao_id: string | null;
  data_pagamento: string | null;
  // Shipping
  forma_envio: string | null;
  codigo_rastreio: string | null;
  url_rastreio: string | null;
  data_envio: string | null;
  nome_destinatario: string | null;
  telefone_destinatario: string | null;
  endereco: any;
  peso_real: number | null;
  // Other
  cupom_desconto: string | null;
  observacoes: string | null;
  envios: any;
  parcelas: any;
  items: OrderItemView[];
  raw: DBOrder;
}

interface OrderItemView {
  id: string;
  name: string | null;
  sku: string | null;
  qty: number;
  price: number;
  raw_json: Json;
}

function mapOrder(db: DBOrder, items?: DBOrderItem[]): OrderView {
  const totals = db.totals_json;
  const payment = db.payment_json;
  const shipping = db.shipping_json;
  const raw = db.raw_json;

  return {
    id: db.id,
    order_number: db.order_number,
    status_name: db.status_name,
    status_id: db.status_id,
    customer_name: getJson(raw, 'cliente_nome') || (typeof getJson(raw, 'cliente') === 'object' ? getJson(raw, 'cliente')?.nome : null),
    customer_email: getJson(raw, 'cliente_email') || (typeof getJson(raw, 'cliente') === 'object' ? getJson(raw, 'cliente')?.email : null),
    customer_phone: getJson(raw, 'cliente_telefone') || (typeof getJson(raw, 'cliente') === 'object' ? (getJson(raw, 'cliente')?.telefone_celular || getJson(raw, 'cliente')?.telefone_principal) : null),
    customer_doc: getJson(raw, 'cliente_cpf_cnpj') || (typeof getJson(raw, 'cliente') === 'object' ? (getJson(raw, 'cliente')?.cpf || getJson(raw, 'cliente')?.cnpj) : null),
    valor_subtotal: getJson(totals, 'subtotal'),
    valor_desconto: getJson(totals, 'discount'),
    valor_frete: getJson(totals, 'shipping'),
    valor_total: getJson(totals, 'total'),
    created_at_remote: db.created_at_remote,
    updated_at_remote: db.updated_at_remote,
    forma_pagamento: getJson(payment, 'method'),
    pagamento_tipo: getJson(payment, 'type'),
    pagamento_parcelas: getJson(payment, 'installments'),
    pagamento_bandeira: getJson(payment, 'brand'),
    pagamento_codigo: null,
    gateway_pagamento: getJson(payment, 'gateway'),
    transacao_id: getJson(payment, 'transaction_id'),
    data_pagamento: getJson(payment, 'data_pagamento'),
    forma_envio: getJson(shipping, 'method'),
    codigo_rastreio: getJson(shipping, 'tracking_code'),
    url_rastreio: getJson(shipping, 'tracking_url'),
    data_envio: getJson(shipping, 'data_envio'),
    nome_destinatario: getJson(shipping, 'nome_destinatario'),
    telefone_destinatario: getJson(shipping, 'telefone_destinatario'),
    endereco: getJson(shipping, 'address'),
    peso_real: getJson(shipping, 'peso_real'),
    cupom_desconto: getJson(raw, 'cupom_desconto'),
    observacoes: getJson(raw, 'observacoes'),
    envios: getJson(shipping, 'all_envios'),
    parcelas: getJson(payment, 'all_payments'),
    items: (items || []).map(i => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      qty: i.qty,
      price: i.price,
      raw_json: i.raw_json,
    })),
    raw: db,
  };
}

interface SyncStats {
  orders: number;
  lastOrdersSync: string | null;
}

interface SalesContentProps {
  integrationId: string;
}

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
  const [stats, setStats] = useState<SyncStats>({
    orders: 0,
    lastOrdersSync: null
  });
  const [selectedOrder, setSelectedOrder] = useState<OrderView | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchStats();
    fetchIntegrationName();
    fetchAvailableStatuses();
  }, [integrationId]);

  useEffect(() => {
    setCurrentPage(0);
  }, [statusFilter, dateFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchOrders();
  }, [currentPage, pageSize, statusFilter, dateFilter, dateFrom, dateTo]);

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
    if (range) {
      q = q.gte('created_at_remote', range.from).lte('created_at_remote', range.to);
    }
    return q;
  }, [integrationId, statusFilter, getDateRange]);

  const fetchAvailableStatuses = async () => {
    const { data } = await supabase
      .from('li_orders')
      .select('status_name')
      .eq('integration_id', integrationId)
      .not('status_name', 'is', null);
    if (data) {
      const unique = [...new Set(data.map(d => d.status_name).filter(Boolean))] as string[];
      setAvailableStatuses(unique.sort());
    }
  };

  const silentRefresh = useCallback(async () => {
    try {
      const from = currentPage * pageSize;
      const to = from + pageSize - 1;

      const q = buildFilteredQuery(
        supabase.from('li_orders').select(LI_ORDER_SELECT, { count: 'exact' })
      ).order('created_at_remote', { ascending: false }).range(from, to);

      const { data, error, count } = await q;

      if (!error && data) {
        setOrders(data.map(d => mapOrder(d)));
        setTotalOrders(count || 0);
      }
    } catch (error) {
      log.error('Error in silent refresh:', error);
    }
  }, [integrationId, currentPage, pageSize, buildFilteredQuery]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`orders-${integrationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'li_orders',
          filter: `integration_id=eq.${integrationId}`
        },
        () => {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            silentRefresh();
            fetchStats();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [integrationId, silentRefresh]);

  const getMostRecentSync = (integration: any): string | null => {
    const dates = [
      integration.last_sync_at,
      integration.last_sync_orders_at,
      integration.last_orders_sync_at,
    ].filter(Boolean);
    if (dates.length === 0) return null;
    return dates.reduce((latest: string, current: string) => new Date(current) > new Date(latest) ? current : latest);
  };

  const fetchIntegrationName = async () => {
    const { data } = await supabase
      .from('integrations')
      .select('name, last_sync_at, last_sync_orders_at, last_orders_sync_at')
      .eq('id', integrationId)
      .single();
    if (data) {
      setIntegrationName(data.name);
      setStats(prev => ({ ...prev, lastOrdersSync: getMostRecentSync(data) }));
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const from = currentPage * pageSize;
      const to = from + pageSize - 1;
      
      const q = buildFilteredQuery(
        supabase.from('li_orders').select(LI_ORDER_SELECT, { count: 'exact' })
      ).order('created_at_remote', { ascending: false }).range(from, to);

      const { data, error, count } = await q;

      if (error) throw error;
      setOrders((data || []).map(d => mapOrder(d)));
      setTotalOrders(count || 0);
    } catch (error) {
      log.error('Error fetching orders:', error);
      toast({
        title: "Erro ao carregar pedidos",
        description: "Não foi possível carregar os pedidos.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const [ordersResult, integrationResult] = await Promise.all([
        supabase.from('li_orders').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId),
        supabase.from('integrations').select('last_sync_at, last_sync_orders_at, last_orders_sync_at').eq('id', integrationId).single()
      ]);

      setStats({
        orders: ordersResult.count || 0,
        lastOrdersSync: integrationResult.data ? getMostRecentSync(integrationResult.data) : null
      });
    } catch (error) {
      log.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    if (syncStatus.status === 'completed') {
      fetchOrders();
      fetchStats();
      supabase
        .from('integrations')
        .update({ 
          last_orders_sync_at: new Date().toISOString(),
          initial_sync_completed: true
        })
        .eq('id', integrationId);
    }
  }, [syncStatus.status, integrationId]);

  const handleSync = async () => {
    try {
      toast({ title: "Sincronização iniciada", description: "Sincronizando pedidos em segundo plano..." });
      await startSync();
    } catch (error: any) {
      log.error('Sync error:', error);
      toast({ title: "Erro na sincronização", description: error.message || "Não foi possível iniciar.", variant: "destructive" });
    }
  };

  const handleCheckNewOrders = async () => {
    try {
      setCheckingNew(true);
      toast({ title: "Verificando novos pedidos", description: "Buscando pedidos novos..." });

      const { error } = await supabase.functions.invoke('li-reconciliation-processor', {
        body: { manual: true, integrationId, syncType: 'orders' }
      });

      if (error) throw error;

      await Promise.all([fetchOrders(), fetchStats()]);
      toast({ title: "Verificação concluída", description: "Pedidos atualizados." });
    } catch (error: any) {
      log.error('Check new orders error:', error);
      toast({ title: "Erro ao verificar", description: error.message || "Erro.", variant: "destructive" });
    } finally {
      setCheckingNew(false);
    }
  };

  const viewOrderDetails = async (order: OrderView) => {
    try {
      const { data: items, error } = await supabase
        .from('li_order_items')
        .select('id, name, sku, qty, price, raw_json')
        .eq('order_id', order.id);

      if (error) throw error;
      
      setSelectedOrder({
        ...order,
        items: (items || []).map(i => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          qty: i.qty,
          price: i.price,
          raw_json: i.raw_json,
        }))
      });
      setDetailsDialogOpen(true);
    } catch (error) {
      log.error('Error fetching order items:', error);
      toast({ title: "Erro", description: "Não foi possível carregar os detalhes.", variant: "destructive" });
    }
  };

  const getStatusColor = (status: string | null) => {
    if (!status) return "secondary";
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes("pago") || lowerStatus.includes("completo") || lowerStatus.includes("enviado")) return "default";
    if (lowerStatus.includes("aguard") || lowerStatus.includes("pendent")) return "secondary";
    if (lowerStatus.includes("cancel")) return "destructive";
    return "outline";
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return "R$ 0,00";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch { return dateStr; }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch { return "Nunca"; }
  };

  const filteredOrders = orders.filter(order => {
    const search = searchTerm.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(search) ||
      (order.customer_name?.toLowerCase().includes(search)) ||
      (order.customer_email?.toLowerCase().includes(search))
    );
  });

  const handleExportCSV = () => {
    const headers = ['Pedido', 'Cliente', 'Email', 'Status', 'Subtotal', 'Frete', 'Total', 'Data'];
    const data = filteredOrders.map(order => [
      order.order_number,
      order.customer_name || '',
      order.customer_email || '',
      order.status_name || '',
      order.valor_subtotal || 0,
      order.valor_frete || 0,
      order.valor_total || 0,
      order.created_at_remote ? format(new Date(order.created_at_remote), "dd/MM/yyyy HH:mm") : ''
    ]);
    exportToCSV({ filename: `pedidos-${integrationName}`, headers, data });
  };

  const handleExportPDF = () => {
    const headers = ['Pedido', 'Cliente', 'Status', 'Total', 'Data'];
    const data = filteredOrders.map(order => [
      `#${order.order_number}`,
      order.customer_name || 'N/A',
      order.status_name || 'N/A',
      formatCurrency(order.valor_total),
      order.created_at_remote ? format(new Date(order.created_at_remote), "dd/MM/yyyy") : '-'
    ]);
    exportToPDF({ 
      filename: `pedidos-${integrationName}`, 
      headers, 
      data,
      title: `Relatório de Pedidos - ${integrationName}`
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sales')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{integrationName || 'Vendas'}</h1>
            <p className="text-muted-foreground">Gerencie os pedidos desta loja</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <SyncStatusBadge integrationId={integrationId} syncType="orders" />
          <DeleteIntegrationDataButton
            integrationId={integrationId}
            dataType="pedidos"
            tablesToDelete={[{ table: 'li_orders', itemsTable: 'li_order_items', itemsForeignKey: 'order_id' }]}
            onDeleted={() => { fetchOrders(); fetchStats(); }}
          />
          <Button variant="outline" onClick={handleCheckNewOrders} disabled={checkingNew || syncStatus.isActive}>
            <Zap className={`h-4 w-4 mr-2 ${checkingNew ? 'animate-pulse' : ''}`} />
            {checkingNew ? 'Verificando...' : 'Verificar Novos'}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSync}
            disabled={syncStatus.isActive || checkingNew}
          >
            {syncStatus.isActive ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : syncStatus.status === 'completed' ? (
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {syncStatus.isActive ? 'Sincronizando...' : syncStatus.status === 'completed' ? 'Concluído!' : 'Sincronizar'}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isExporting || orders.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileText className="h-4 w-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF}>
                <FileText className="h-4 w-4 mr-2" />
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Sync Progress */}
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

      {/* Stats Cards */}
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

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-2">
                <Filter className="h-4 w-4" />
                Filtros
                {(statusFilter !== 'all' || dateFilter !== 'all') && (
                  <Badge variant="secondary" className="ml-1 text-xs">Ativo</Badge>
                )}
              </Button>
              {(statusFilter !== 'all' || dateFilter !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => { setStatusFilter('all'); setDateFilter('all'); setDateFrom(undefined); setDateTo(undefined); }}>
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}
            </div>
            {showFilters && (
              <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
                <div className="space-y-1 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      {availableStatuses.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Período</label>
                  <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); if (v !== 'custom') { setDateFrom(undefined); setDateTo(undefined); } }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todo período</SelectItem>
                      <SelectItem value="7d">Últimos 7 dias</SelectItem>
                      <SelectItem value="30d">Últimos 30 dias</SelectItem>
                      <SelectItem value="90d">Últimos 90 dias</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dateFilter === 'custom' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">De</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-9 w-full sm:w-[140px] justify-start text-left font-normal text-sm">
                            <CalendarIcon className="mr-2 h-3 w-3" />
                            {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Início"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Até</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-9 w-full sm:w-[140px] justify-start text-left font-normal text-sm">
                            <CalendarIcon className="mr-2 h-3 w-3" />
                            {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fim"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Pedidos ({totalOrders})</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar pedidos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {orders.length === 0 ? (
                <div>
                  <p>Nenhum pedido sincronizado ainda.</p>
                  <Button variant="outline" className="mt-4" onClick={handleSync} disabled={syncStatus.isActive}>
                    Sincronizar Pedidos
                  </Button>
                </div>
              ) : (
                <p>Nenhum pedido encontrado com o termo "{searchTerm}"</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Frete</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">#{order.order_number}</span>
                          {order.codigo_rastreio && <span title="Com rastreio"><Truck className="h-3 w-3 text-blue-500" /></span>}
                          {order.cupom_desconto && <span title={`Cupom: ${order.cupom_desconto}`}><Tag className="h-3 w-3 text-green-500" /></span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.customer_name || 'N/A'}</p>
                          <p className="text-sm text-muted-foreground">{order.customer_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(order.status_name)}>
                          {order.status_name || 'Desconhecido'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatCurrency(order.valor_frete)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(order.valor_total)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(order.created_at_remote)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => viewOrderDetails(order)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Itens por página:</span>
                  <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(Number(value)); setCurrentPage(0); }}>
                    <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="75">75</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, totalOrders)} de {totalOrders}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>Anterior</Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={(currentPage + 1) * pageSize >= totalOrders}>Próximo</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <LIOrderDetailsDialog
        order={selectedOrder}
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
      />
    </div>
  );
}
