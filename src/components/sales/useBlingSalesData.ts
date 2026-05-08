import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBlingSync } from "@/hooks/useBlingSync";
import { useBlingCodeMappings } from "@/hooks/useBlingCodeMappings";
import { useExportCSV } from "@/hooks/useExportCSV";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { createLogger } from '@/lib/logger';
const log = createLogger('useBlingSalesData');

export interface BlingOrder {
  id: string;
  bling_id: number;
  numero: string;
  numero_loja: string | null;
  situacao_nome: string | null;
  situacao_id: number | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  cliente_email: string | null;
  cliente_telefone: string | null;
  cliente_cpf_cnpj: string | null;
  valor_total: number | null;
  valor_produtos: number | null;
  valor_desconto: number | null;
  valor_frete: number | null;
  outras_despesas: number | null;
  data_criacao: string | null;
  data_saida: string | null;
  data_prevista: string | null;
  forma_pagamento: string | null;
  forma_envio: string | null;
  loja_nome: string | null;
  loja_id: number | null;
  observacoes: string | null;
  observacoes_internas: string | null;
  endereco_entrega: any;
  integration_id: string;
  categoria_id: number | null;
  nota_fiscal_id: number | null;
  total_icms: number | null;
  total_ipi: number | null;
  vendedor_id: number | null;
  intermediador_cnpj: string | null;
  intermediador_nome_usuario: string | null;
  taxa_comissao: number | null;
  custo_frete: number | null;
  valor_base: number | null;
  frete_por_conta: number | null;
  quantidade_volumes: number | null;
  peso_bruto: number | null;
  prazo_entrega: number | null;
  transportador_id: number | null;
  transportador_nome: string | null;
  etiqueta: any;
  volumes: any[] | any;
  parcelas: any[] | any;
  numero_pedido_compra: string | null;
}

export interface BlingOrderItem {
  id: string;
  produto_nome: string | null;
  sku: string | null;
  quantidade: number;
  valor_unitario: number | null;
  valor_total: number | null;
  desconto: number | null;
  unidade: string | null;
  aliquota_ipi: number | null;
  descricao_detalhada: string | null;
  comissao_base: number | null;
  comissao_aliquota: number | null;
  comissao_valor: number | null;
  preco_custo: number | null;
}

const ORDER_COLUMNS = 'id, bling_id, numero, numero_loja, situacao_id, situacao_nome, cliente_id, cliente_nome, cliente_email, cliente_telefone, cliente_cpf_cnpj, valor_total, valor_produtos, valor_desconto, valor_frete, outras_despesas, data_criacao, data_saida, data_prevista, forma_pagamento, forma_envio, loja_nome, loja_id, observacoes, observacoes_internas, endereco_entrega, integration_id, categoria_id, nota_fiscal_id, total_icms, total_ipi, vendedor_id, intermediador_cnpj, intermediador_nome_usuario, taxa_comissao, custo_frete, valor_base, frete_por_conta, quantidade_volumes, peso_bruto, prazo_entrega, transportador_id, transportador_nome, etiqueta, volumes, parcelas, numero_pedido_compra';

export function useBlingSalesData(integrationId: string) {
  const { toast } = useToast();
  const { syncStatus, startSync, checkForNew, cancelSync, currentJob } = useBlingSync(integrationId, 'orders');
  const { getDisplayName, getColor } = useBlingCodeMappings(integrationId);
  const { exportToCSV, isExporting } = useExportCSV();
  const [orders, setOrders] = useState<BlingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [integrationName, setIntegrationName] = useState("");
  const [stats, setStats] = useState({ orders: 0, lastOrdersSync: null as string | null });
  const [selectedOrder, setSelectedOrder] = useState<BlingOrder | null>(null);
  const [orderItems, setOrderItems] = useState<BlingOrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [storeSelectorOpen, setStoreSelectorOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalOrders, setTotalOrders] = useState(0);

  const getMostRecentSync = (integration: Record<string, unknown>): string | null => {
    const dates = [integration.last_sync_at, integration.last_sync_orders_at, integration.last_orders_sync_at, integration.last_sync_products_at, integration.last_sync_customers_at].filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.reduce((latest, current) => new Date(current) > new Date(latest) ? current : latest);
  };

  const fetchIntegrationName = useCallback(async () => {
    const { data } = await supabase.from('integrations').select('name, last_sync_at, last_sync_orders_at, last_orders_sync_at, last_sync_products_at, last_sync_customers_at').eq('id', integrationId).single();
    if (data) {
      setIntegrationName(data.name);
      setStats(prev => ({ ...prev, lastOrdersSync: getMostRecentSync(data as unknown as any) }));
    }
  }, [integrationId]);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const { count } = await supabase.from('bling_orders').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId);
      setTotalOrders(count || 0);
      const from = (currentPage - 1) * itemsPerPage;
      const { data, error } = await supabase.from('bling_orders').select(ORDER_COLUMNS).eq('integration_id', integrationId).order('data_criacao', { ascending: false }).range(from, from + itemsPerPage - 1);
      if (error) throw error;
      setOrders((data as BlingOrder[]) || []);
    } catch (error) {
      log.error('Error fetching Bling orders:', error);
      toast({ title: "Erro ao carregar pedidos", description: "Não foi possível carregar os pedidos do Bling.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [integrationId, currentPage, itemsPerPage, toast]);

  const silentRefresh = useCallback(async () => {
    try {
      const { count } = await supabase.from('bling_orders').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId);
      setTotalOrders(count || 0);
      const from = (currentPage - 1) * itemsPerPage;
      const { data, error } = await supabase.from('bling_orders').select(ORDER_COLUMNS).eq('integration_id', integrationId).order('data_criacao', { ascending: false }).range(from, from + itemsPerPage - 1);
      if (!error && data) setOrders(data as BlingOrder[]);
    } catch (error) {
      log.error('Error in silent refresh:', error);
    }
  }, [integrationId, currentPage, itemsPerPage]);

  const fetchStats = useCallback(async () => {
    try {
      const [ordersResult, integrationResult] = await Promise.all([
        supabase.from('bling_orders').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId),
        supabase.from('integrations').select('last_sync_at, last_sync_orders_at, last_orders_sync_at, last_sync_products_at, last_sync_customers_at').eq('id', integrationId).single()
      ]);
      setStats({ orders: ordersResult.count || 0, lastOrdersSync: integrationResult.data ? getMostRecentSync(integrationResult.data as unknown as any) : null });
    } catch (error) {
      log.error('Error fetching stats:', error);
    }
  }, [integrationId]);

  useEffect(() => { fetchOrders(); fetchStats(); fetchIntegrationName(); }, [fetchOrders, fetchStats, fetchIntegrationName]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel(`bling-orders-${integrationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bling_orders', filter: `integration_id=eq.${integrationId}` }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { silentRefresh(); fetchStats(); }, 500);
      }).subscribe();
    return () => { if (debounceTimer) clearTimeout(debounceTimer); supabase.removeChannel(channel); };
  }, [integrationId, silentRefresh, fetchStats]);

  useEffect(() => { if (syncStatus === 'completed') { silentRefresh(); fetchStats(); } }, [syncStatus, silentRefresh, fetchStats]);

  const handleExportOrders = async () => {
    const { data: allOrders, error } = await supabase.from('bling_orders').select(ORDER_COLUMNS).eq('integration_id', integrationId).order('data_criacao', { ascending: false });
    if (error || !allOrders) { toast({ title: "Erro na exportação", description: "Não foi possível buscar os pedidos.", variant: "destructive" }); return; }
    await exportToCSV({
      filename: 'vendas-bling',
      headers: ['Número', 'Número Loja', 'Cliente', 'CPF/CNPJ', 'Email', 'Telefone', 'Valor Produtos', 'Frete', 'Desconto', 'Total', 'Status', 'Data Criação', 'Forma Pagamento', 'Forma Envio', 'Loja'],
      data: allOrders.map(o => [o.numero, o.numero_loja, o.cliente_nome, o.cliente_cpf_cnpj, o.cliente_email, o.cliente_telefone, o.valor_produtos, o.valor_frete, o.valor_desconto, o.valor_total, o.situacao_nome, o.data_criacao ? format(new Date(o.data_criacao), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '', o.forma_pagamento, o.forma_envio, o.loja_nome])
    });
  };

  const handleSyncClick = () => setStoreSelectorOpen(true);

  const handleSyncWithStores = async (storeIds: number[] | null) => {
    try {
      toast({ title: "Sincronização iniciada", description: storeIds ? `Sincronizando pedidos de ${storeIds.length} loja(s)...` : "Sincronizando pedidos de todas as lojas..." });
      await startSync(storeIds || undefined);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Não foi possível iniciar a sincronização.";
      toast({ title: "Erro na sincronização", description: msg, variant: "destructive" });
    }
  };

  const viewOrderDetails = async (order: BlingOrder) => {
    setSelectedOrder(order);
    setLoadingItems(true);
    try {
      const { data: savedOrder } = await supabase.from('bling_orders').select('id').eq('bling_id', order.bling_id).eq('integration_id', integrationId).single();
      if (savedOrder) {
        const { data, error } = await supabase.from('bling_order_items').select('id, produto_nome, sku, quantidade, valor_unitario, valor_total, desconto, unidade, aliquota_ipi, descricao_detalhada, comissao_base, comissao_aliquota, comissao_valor, preco_custo').eq('order_id', savedOrder.id);
        if (error) throw error;
        setOrderItems(data || []);
      }
    } catch (error) {
      log.error('Error fetching order items:', error);
      toast({ title: "Erro", description: "Não foi possível carregar os itens do pedido.", variant: "destructive" });
    } finally {
      setLoadingItems(false);
    }
  };

  const getStatusColor = (status: string | null, situacaoId: number | null): "default" | "destructive" | "outline" | "secondary" => {
    if (situacaoId) {
      const customColor = getColor('order_status', String(situacaoId));
      if (customColor) {
        const colorMap: Record<string, "default" | "destructive" | "outline" | "secondary"> = { green: 'default', yellow: 'secondary', red: 'destructive', blue: 'outline', purple: 'outline', orange: 'secondary', gray: 'secondary' };
        return colorMap[customColor] || 'outline';
      }
    }
    if (!status) return "secondary";
    const ls = status.toLowerCase();
    if (ls.includes("pago") || ls.includes("completo") || ls.includes("enviado") || ls.includes("atendido")) return "default";
    if (ls.includes("aguard") || ls.includes("pendent") || ls.includes("aberto")) return "secondary";
    if (ls.includes("cancel")) return "destructive";
    return "outline";
  };

  const getStatusDisplayName = (status: string | null, situacaoId: number | null) => {
    if (situacaoId) { const n = getDisplayName('order_status', String(situacaoId)); if (n) return n; }
    return status || 'Desconhecido';
  };

  const getPaymentDisplayName = (code: string | null) => {
    if (code) { const n = getDisplayName('payment_method', code); if (n) return n; }
    return code || null;
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return "R$ 0,00";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string | null, showTimeIfAvailable = true) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      const hasRealTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0;
      if (showTimeIfAvailable && hasRealTime) return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
      const dd = String(date.getUTCDate()).padStart(2, '0');
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${date.getUTCFullYear()}`;
    } catch { return dateStr; }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR }); } catch { return "Nunca"; }
  };

  const filteredOrders = orders.filter(order => {
    const s = searchTerm.toLowerCase();
    return order.numero.toLowerCase().includes(s) || (order.cliente_nome?.toLowerCase().includes(s)) || (order.cliente_email?.toLowerCase().includes(s)) || (order.loja_nome?.toLowerCase().includes(s));
  });

  const isSyncing = syncStatus === 'syncing';
  const totalPages = Math.ceil((searchTerm ? filteredOrders.length : totalOrders) / itemsPerPage);
  const displayedOrders = searchTerm ? filteredOrders : orders;

  const handlePageChange = (page: number) => { if (page >= 1 && page <= totalPages) setCurrentPage(page); };
  const handleItemsPerPageChange = (value: string) => { setItemsPerPage(Number(value)); setCurrentPage(1); };

  return {
    orders, loading, searchTerm, setSearchTerm, integrationName, stats,
    selectedOrder, setSelectedOrder, orderItems, loadingItems,
    storeSelectorOpen, setStoreSelectorOpen,
    currentPage, itemsPerPage, totalOrders, totalPages, displayedOrders, filteredOrders,
    isSyncing, syncStatus, currentJob,
    handleExportOrders, isExporting,
    handleSyncClick, handleSyncWithStores, cancelSync, checkForNew,
    viewOrderDetails, getStatusColor, getStatusDisplayName, getPaymentDisplayName,
    formatCurrency, formatDate, formatLastSync,
    handlePageChange, handleItemsPerPageChange,
    fetchOrders, fetchStats,
  };
}
