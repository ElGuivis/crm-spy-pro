import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Truck, 
  RefreshCw, 
  Search, 
  Package, 
  Clock, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  DollarSign,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeft,
  AlertTriangle,
  MoreHorizontal,
  Eye,
  ExternalLink,
  MessageSquare,
  TrendingUp
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMelhorEnvio, useMelhorEnvioShipments, MelhorEnvioShipment } from '@/hooks/useMelhorEnvio';
import { useMelhorEnvioSync } from '@/hooks/useMelhorEnvioSync';
import { MelhorEnvioDialog } from '@/components/integrations/MelhorEnvioDialog';
import { SyncStatusBadge } from '@/components/common/SyncStatusBadge';
import { SyncProgressBanner } from '@/components/common/SyncProgressBanner';
import { useAuth } from '@/contexts/AuthContext';
import { DeleteIntegrationDataButton } from '@/components/common/DeleteIntegrationDataButton';
import { ShipmentDetailsDialog } from '@/components/envios/ShipmentDetailsDialog';
import { StoreLinker } from '@/components/envios/StoreLinker';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { createLogger } from '@/lib/logger';
const log = createLogger('EnviosContent');

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  posted: { label: 'Postado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Package },
  in_transit: { label: 'Em Trânsito', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: Truck },
  delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  canceled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  expired: { label: 'Expirado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: AlertCircle },
  returning: { label: 'Retornando', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: RotateCcw },
  returned: { label: 'Devolvido', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: RotateCcw },
};

interface EnviosContentProps {
  integrationId: string;
}

export function EnviosContent({ integrationId }: EnviosContentProps) {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [carrierFilter, setCarrierFilter] = useState('all');
  const [daysFilter, setDaysFilter] = useState('all');
  const [selectedShipment, setSelectedShipment] = useState<MelhorEnvioShipment | null>(null);
  const [showIntegrationDialog, setShowIntegrationDialog] = useState(false);
  const [isUpdatingShipment, setIsUpdatingShipment] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [cardFilter, setCardFilter] = useState<string | null>(searchParams.get('cardFilter') || null);
  const [isCheckingNew, setIsCheckingNew] = useState(false);
  const { toast } = useToast();

  const { data: integration } = useQuery({
    queryKey: ['integration-name', integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integrations')
        .select('name')
        .eq('id', integrationId)
        .single();
      return data;
    }
  });

  const { 
    status: integrationStatus, 
    isLoading: isLoadingIntegration, 
    syncTracking,
    syncSingleShipment,
    isSyncing: isTrackingSyncing 
  } = useMelhorEnvio();

  const {
    progress: syncProgress,
    isSyncing,
    startSync,
    cancelSync,
    forceReset,
    resetProgress
  } = useMelhorEnvioSync(integrationId);
  
  // Determine effective status filter (cardFilter takes precedence)
  const effectiveStatusFilter = cardFilter && cardFilter !== 'delayed' ? cardFilter : statusFilter;
  const isDelayedFilter = cardFilter === 'delayed' || activeTab === 'delayed';
  
  // Main shipments query (all shipments)
  const { shipments, isLoading, refetch, carriers, stats, globalStats, totalCount, totalPages } = useMelhorEnvioShipments({
    status: !isDelayedFilter ? effectiveStatusFilter : undefined,
    carrier: carrierFilter,
    search: search.length >= 3 ? search : undefined,
    page: currentPage,
    pageSize: pageSize,
    integrationId,
    delayedOnly: isDelayedFilter
  });

  // Refetch quando sync completar
  useEffect(() => {
    if (syncProgress.status === 'completed') {
      setCurrentPage(1);
      refetch();
      // Reset progress after 3 seconds
      const timer = setTimeout(resetProgress, 3000);
      return () => clearTimeout(timer);
    }
  }, [syncProgress.status, refetch, resetProgress]);

  // Realtime subscription para atualizações automáticas
  useEffect(() => {
    const channel = supabase
      .channel('me-shipments-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'me_shipments',
          filter: `integration_id=eq.${integrationId}`
        },
        (payload) => {
          log.info('[Realtime] Shipment update:', payload.eventType);
          // Refetch on any change
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [integrationId, refetch]);

  // Handle tab change
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setCardFilter(null);
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('tab', tab);
    setSearchParams(params);
  };

  // Handle card filter click
  const handleCardClick = (filter: string) => {
    if (filter === cardFilter) {
      // Clear filter if clicking the same card
      setCardFilter(null);
      setActiveTab('all');
      setSearchParams({});
    } else if (filter === 'delayed') {
      setCardFilter('delayed');
      setActiveTab('delayed');
      setSearchParams({ tab: 'delayed', cardFilter: 'delayed' });
    } else if (filter === 'all') {
      setCardFilter(null);
      setActiveTab('all');
      setSearchParams({});
    } else {
      setCardFilter(filter);
      setActiveTab('all');
      setSearchParams({ cardFilter: filter });
    }
    setCurrentPage(1);
  };

  const clearCardFilter = () => {
    setCardFilter(null);
    setActiveTab('all');
    setSearchParams({});
    setCurrentPage(1);
  };

  const getCardFilterLabel = (filter: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendentes',
      posted: 'Postados',
      in_transit: 'Em Trânsito',
      delivered: 'Entregues',
      canceled: 'Cancelados',
      delayed: 'Atrasados'
    };
    return labels[filter] || filter;
  };

  const handleSync = async () => {
    await startSync();
  };

  const handleSyncTracking = async () => {
    await syncTracking();
    await refetch();
  };

  const handleCheckNew = async () => {
    setIsCheckingNew(true);
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio', {
        body: { action: 'check-new', integrationId }
      });
      
      if (error) throw error;
      
      const newCount = data?.newShipments || 0;
      toast({
        title: newCount > 0 ? "Novos envios encontrados" : "Nenhum novo envio",
        description: newCount > 0 
          ? `${newCount} novo(s) envio(s) sincronizado(s).` 
          : "Todos os envios já estão atualizados.",
      });
      
      await refetch();
    } catch (error) {
      log.error('Error checking new shipments:', error);
      toast({
        title: "Erro ao verificar",
        description: "Não foi possível verificar novos envios.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingNew(false);
    }
  };

  const handlePageSizeChange = (newSize: string) => {
    setPageSize(parseInt(newSize));
    setCurrentPage(1);
  };

  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleUpdateSingleShipment = async (shipmentId: string) => {
    setIsUpdatingShipment(true);
    await syncSingleShipment(shipmentId);
    await refetch();
    setIsUpdatingShipment(false);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return '-';
    }
  };

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), "dd/MM/yy", { locale: ptBR });
    } catch {
      return '-';
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusBadge = (status: string | null) => {
    const config = statusConfig[status || 'pending'] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getDaysLate = (shipment: MelhorEnvioShipment): number => {
    if (!shipment.estimated_delivery_at) return 0;
    const estimated = new Date(shipment.estimated_delivery_at);
    const now = new Date();
    return Math.max(0, Math.ceil((now.getTime() - estimated.getTime()) / (1000 * 60 * 60 * 24)));
  };

  const getDaysLateBadge = (daysLate: number) => {
    if (daysLate <= 3) {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">{daysLate} dias</Badge>;
    }
    if (daysLate <= 7) {
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">{daysLate} dias</Badge>;
    }
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{daysLate} dias</Badge>;
  };

  // Filter delayed shipments by days
  const filteredShipments = activeTab === 'delayed' && daysFilter !== 'all'
    ? shipments.filter(s => {
        const days = getDaysLate(s);
        switch (daysFilter) {
          case '1-3': return days >= 1 && days <= 3;
          case '4-7': return days >= 4 && days <= 7;
          case '8-15': return days >= 8 && days <= 15;
          case '15+': return days > 15;
          default: return true;
        }
      })
    : shipments;

  if (isLoadingIntegration) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const toAddress = selectedShipment?.to_address as any;
  const trackingEvents = (selectedShipment?.tracking_events || []) as any[];
  const invoice = selectedShipment?.invoice as any;
  const products = (selectedShipment?.products || []) as any[];

  return (
    <div className="p-6 space-y-6">
      <SyncProgressBanner integrationId={integrationId} melhorEnvio tenantId={tenantId} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/envios')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{integration?.name || 'Envios'}</h1>
            <p className="text-muted-foreground">
              Gerencie seus envios e rastreie entregas
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <SyncStatusBadge
            integrationId={integrationId}
            syncType="shipments"
          />
          <DeleteIntegrationDataButton
            integrationId={integrationId}
            dataType="envios"
            tablesToDelete={[{ table: 'me_shipments' }]}
            onDeleted={() => refetch()}
          />
          <Button variant="outline" onClick={() => setShowIntegrationDialog(true)}>
            <Truck className="h-4 w-4 mr-2" />
            Configurar
          </Button>
          <Button variant="outline" onClick={handleCheckNew} disabled={isCheckingNew || isSyncing}>
            <Search className={`h-4 w-4 mr-2 ${isCheckingNew ? 'animate-pulse' : ''}`} />
            {isCheckingNew ? 'Verificando...' : 'Verificar Novos'}
          </Button>
          <Button variant="outline" onClick={handleSyncTracking} disabled={isSyncing || isTrackingSyncing}>
            <RotateCcw className={`h-4 w-4 mr-2 ${isTrackingSyncing ? 'animate-spin' : ''}`} />
            Atualizar Rastreios
          </Button>
          {isSyncing ? (
            <Button variant="destructive" onClick={cancelSync}>
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar ({syncProgress.itemsSaved || 0}/{syncProgress.itemsTotal || '?'})
            </Button>
          ) : syncProgress.status === 'failed' ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={forceReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Resetar
              </Button>
              <Button onClick={() => startSync(true)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar Novamente
              </Button>
            </div>
          ) : (
            <Button onClick={handleSync}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar Tudo
            </Button>
          )}
        </div>
      </div>

      {/* Store Linker */}
      <StoreLinker integrationId={integrationId} onLinked={() => refetch()} />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
        <Card 
          className={`cursor-pointer transition-all hover:border-primary ${!cardFilter ? 'border-primary bg-primary/5' : ''}`}
          onClick={() => handleCardClick('all')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{globalStats.total}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover:border-yellow-500 ${cardFilter === 'pending' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
          onClick={() => handleCardClick('pending')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-yellow-600">{globalStats.pending}</div>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover:border-blue-500 ${cardFilter === 'posted' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
          onClick={() => handleCardClick('posted')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-blue-600">{globalStats.posted}</div>
            <p className="text-xs text-muted-foreground">Postados</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover:border-purple-500 ${cardFilter === 'in_transit' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : ''}`}
          onClick={() => handleCardClick('in_transit')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-purple-600">{globalStats.inTransit}</div>
            <p className="text-xs text-muted-foreground">Em Trânsito</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover:border-green-500 ${cardFilter === 'delivered' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`}
          onClick={() => handleCardClick('delivered')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-green-600">{globalStats.delivered}</div>
            <p className="text-xs text-muted-foreground">Entregues</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover:border-red-500 ${cardFilter === 'canceled' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
          onClick={() => handleCardClick('canceled')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-red-600">{globalStats.canceled}</div>
            <p className="text-xs text-muted-foreground">Cancelados</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all hover:border-orange-500 ${cardFilter === 'delayed' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : ''}`}
          onClick={() => handleCardClick('delayed')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <div>
                <div className="text-2xl font-bold text-orange-600">{globalStats.delayed}</div>
                <p className="text-xs text-muted-foreground">Atrasados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-xl font-bold">{formatCurrency(globalStats.totalValue)}</div>
                <p className="text-xs text-muted-foreground">Valor Total em Fretes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Card Filter Indicator */}
      {cardFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtrando por:</span>
          <Badge variant="secondary" className="gap-1">
            {getCardFilterLabel(cardFilter)}
            <button 
              onClick={clearCardFilter}
              className="ml-1 hover:text-destructive"
            >
              ✕
            </button>
          </Badge>
        </div>
      )}

      {/* Média de entrega */}
      {stats.averageDeliveryDays > 0 && (
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tempo médio de entrega</p>
                <p className="text-xl font-bold">{stats.averageDeliveryDays} dias</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">Todos os Envios</TabsTrigger>
          <TabsTrigger value="delayed" className="gap-2">
            Atrasados
            {globalStats.delayed > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5">
                {globalStats.delayed}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Filters */}
        <Card className="mt-4">
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por código, pedido ou destinatário..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (e.target.value.length >= 3 || e.target.value.length === 0) {
                      setCurrentPage(1);
                    }
                  }}
                  className="pl-10"
                />
              </div>
              {activeTab === 'all' && (
                <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="posted">Postado</SelectItem>
                    <SelectItem value="in_transit">Em Trânsito</SelectItem>
                    <SelectItem value="delivered">Entregue</SelectItem>
                    <SelectItem value="canceled">Cancelado</SelectItem>
                    <SelectItem value="returning">Retornando</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {activeTab === 'delayed' && (
                <Select value={daysFilter} onValueChange={handleFilterChange(setDaysFilter)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Dias de atraso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="1-3">1-3 dias</SelectItem>
                    <SelectItem value="4-7">4-7 dias</SelectItem>
                    <SelectItem value="8-15">8-15 dias</SelectItem>
                    <SelectItem value="15+">Mais de 15 dias</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={carrierFilter} onValueChange={handleFilterChange(setCarrierFilter)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Transportadora" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {carriers.map(carrier => (
                    <SelectItem key={carrier} value={carrier!}>{carrier}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Shipments Table */}
        <Card className="mt-4">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredShipments.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">
                  {activeTab === 'delayed' ? 'Nenhum envio atrasado' : 'Nenhum envio encontrado'}
                </h3>
                <p className="text-muted-foreground">
                  {activeTab === 'delayed'
                    ? 'Não há envios com previsão de entrega expirada'
                    : search || statusFilter !== 'all' || carrierFilter !== 'all'
                      ? 'Tente ajustar os filtros de busca'
                      : 'Clique em "Sincronizar Tudo" para buscar seus envios'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rastreio</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Transportadora</TableHead>
                    {activeTab === 'delayed' && <TableHead>Previsão</TableHead>}
                    {activeTab === 'delayed' && <TableHead>Atraso</TableHead>}
                    <TableHead>Status</TableHead>
                    {activeTab === 'all' && <TableHead className="text-right">Valor</TableHead>}
                    {activeTab === 'all' && <TableHead>Data</TableHead>}
                    {activeTab === 'delayed' && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShipments.map((shipment) => (
                    <TableRow 
                      key={shipment.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedShipment(shipment)}
                    >
                      <TableCell className="font-mono text-sm">
                        {shipment.tracking_code || shipment.protocol || '-'}
                      </TableCell>
                      <TableCell>
                        {shipment.external_order_number ? (
                          <span className="font-medium text-primary">#{shipment.external_order_number}</span>
                        ) : shipment.order_number ? (
                          `#${shipment.order_number}`
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium truncate max-w-[150px]">
                            {shipment.receiver_name || '-'}
                          </div>
                          {shipment.receiver_city && shipment.receiver_state && (
                            <div className="text-xs text-muted-foreground">
                              {shipment.receiver_city}/{shipment.receiver_state}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{shipment.carrier || '-'}</div>
                          <div className="text-xs text-muted-foreground">{shipment.service_name}</div>
                        </div>
                      </TableCell>
                      {activeTab === 'delayed' && (
                        <TableCell className="text-sm text-destructive font-medium">
                          {formatShortDate(shipment.estimated_delivery_at)}
                        </TableCell>
                      )}
                      {activeTab === 'delayed' && (
                        <TableCell>
                          {getDaysLateBadge(getDaysLate(shipment))}
                        </TableCell>
                      )}
                      <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                      {activeTab === 'all' && (
                        <TableCell className="text-right font-medium">
                          {formatCurrency(shipment.price)}
                        </TableCell>
                      )}
                      {activeTab === 'all' && (
                        <TableCell className="text-sm text-muted-foreground">
                          {formatShortDate(shipment.generated_at)}
                        </TableCell>
                      )}
                      {activeTab === 'delayed' && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover">
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open('https://melhorenvio.com.br/painel/etiquetas', '_blank');
                                }}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Ver no Melhor Envio
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateSingleShipment(shipment.id);
                                }}
                                disabled={isUpdatingShipment}
                              >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isUpdatingShipment ? 'animate-spin' : ''}`} />
                                Atualizar Rastreio
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open('https://centraldeajuda.melhorenvio.com.br/hc/pt-br/requests/new', '_blank');
                                }}
                              >
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Abrir Chamado
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedShipment(shipment);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Ver Detalhes
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Exibindo {shipments.length} de {totalCount} envios</span>
              <span className="hidden sm:inline">•</span>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline">Por página:</span>
                <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span className="px-3 text-sm">
                Página {currentPage} de {totalPages}
              </span>
              
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
      </Tabs>

      {/* Shipment Details Dialog */}
      <ShipmentDetailsDialog
        shipment={selectedShipment}
        open={!!selectedShipment}
        onOpenChange={(open) => !open && setSelectedShipment(null)}
        onRefresh={handleUpdateSingleShipment}
        isRefreshing={isUpdatingShipment}
      />

      <MelhorEnvioDialog 
        open={showIntegrationDialog} 
        onOpenChange={setShowIntegrationDialog} 
      />
    </div>
  );
}
