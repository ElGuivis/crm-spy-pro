import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { useMelhorEnvio, useMelhorEnvioShipments, MelhorEnvioShipment } from '@/hooks/useMelhorEnvio';
import { useMelhorEnvioSync } from '@/hooks/useMelhorEnvioSync';
import { MelhorEnvioDialog } from '@/components/integrations/MelhorEnvioDialog';
import { SyncProgressBanner } from '@/components/common/SyncProgressBanner';
import { useAuth } from '@/contexts/AuthContext';
import { ShipmentDetailsDialog } from '@/components/envios/ShipmentDetailsDialog';
import { StoreLinker } from '@/components/envios/StoreLinker';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';

import { getDaysLate } from './envios-helpers';
import { EnviosHeader } from './EnviosHeader';
import { EnviosStatsCards } from './EnviosStatsCards';
import { EnviosShipmentsTable } from './EnviosShipmentsTable';
import { EnviosPagination } from './EnviosPagination';

const log = createLogger('EnviosContent');

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
      const { data } = await supabase.from('integrations').select('name').eq('id', integrationId).single();
      return data;
    }
  });

  const { status: integrationStatus, isLoading: isLoadingIntegration, syncTracking, syncSingleShipment, isSyncing: isTrackingSyncing } = useMelhorEnvio();
  const { progress: syncProgress, isSyncing, startSync, cancelSync, forceReset, resetProgress } = useMelhorEnvioSync(integrationId);

  const effectiveStatusFilter = cardFilter && cardFilter !== 'delayed' ? cardFilter : statusFilter;
  const isDelayedFilter = cardFilter === 'delayed' || activeTab === 'delayed';

  const { shipments, isLoading, refetch, carriers, stats, globalStats, totalCount, totalPages } = useMelhorEnvioShipments({
    status: !isDelayedFilter ? effectiveStatusFilter : undefined,
    carrier: carrierFilter,
    search: search.length >= 3 ? search : undefined,
    page: currentPage,
    pageSize,
    integrationId,
    delayedOnly: isDelayedFilter,
  });

  useEffect(() => {
    if (syncProgress.status === 'completed') {
      setCurrentPage(1);
      refetch();
      const timer = setTimeout(resetProgress, 3000);
      return () => clearTimeout(timer);
    }
  }, [syncProgress.status, refetch, resetProgress]);

  useEffect(() => {
    const channel = supabase.channel('me-shipments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'me_shipments', filter: `integration_id=eq.${integrationId}` },
        (payload) => { log.info('[Realtime] Shipment update:', payload.eventType); refetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [integrationId, refetch]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab); setCurrentPage(1); setCardFilter(null);
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('tab', tab);
    setSearchParams(params);
  };

  const handleCardClick = (filter: string) => {
    if (filter === cardFilter) { setCardFilter(null); setActiveTab('all'); setSearchParams({}); }
    else if (filter === 'delayed') { setCardFilter('delayed'); setActiveTab('delayed'); setSearchParams({ tab: 'delayed', cardFilter: 'delayed' }); }
    else if (filter === 'all') { setCardFilter(null); setActiveTab('all'); setSearchParams({}); }
    else { setCardFilter(filter); setActiveTab('all'); setSearchParams({ cardFilter: filter }); }
    setCurrentPage(1);
  };

  const clearCardFilter = () => { setCardFilter(null); setActiveTab('all'); setSearchParams({}); setCurrentPage(1); };

  const handleCheckNew = async () => {
    setIsCheckingNew(true);
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio', { body: { action: 'check-new', integrationId } });
      if (error) throw error;
      const newCount = data?.newShipments || 0;
      toast({
        title: newCount > 0 ? "Novos envios encontrados" : "Nenhum novo envio",
        description: newCount > 0 ? `${newCount} novo(s) envio(s) sincronizado(s).` : "Todos os envios já estão atualizados.",
      });
      await refetch();
    } catch (error) {
      log.error('Error checking new shipments:', error);
      toast({ title: "Erro ao verificar", description: "Não foi possível verificar novos envios.", variant: "destructive" });
    } finally { setIsCheckingNew(false); }
  };

  const handleUpdateSingleShipment = async (shipmentId: string) => {
    setIsUpdatingShipment(true);
    await syncSingleShipment(shipmentId);
    await refetch();
    setIsUpdatingShipment(false);
  };

  const handleFilterChange = (setter: (v: string) => void) => (value: string) => { setter(value); setCurrentPage(1); };

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
    return <div className="p-6 flex items-center justify-center min-h-[400px]" />;
  }

  return (
    <div className="p-6 space-y-6">
      <SyncProgressBanner integrationId={integrationId} melhorEnvio tenantId={tenantId} />

      <EnviosHeader
        integrationId={integrationId}
        integrationName={integration?.name}
        isSyncing={isSyncing}
        isTrackingSyncing={isTrackingSyncing}
        isCheckingNew={isCheckingNew}
        syncProgress={syncProgress}
        onBack={() => navigate('/envios')}
        onConfigure={() => setShowIntegrationDialog(true)}
        onCheckNew={handleCheckNew}
        onSyncTracking={async () => { await syncTracking(); await refetch(); }}
        onSync={() => startSync()}
        onCancelSync={cancelSync}
        onForceReset={forceReset}
        onRetrySync={() => startSync(true)}
        onDeleted={() => refetch()}
      />

      <StoreLinker integrationId={integrationId} onLinked={() => refetch()} />

      <EnviosStatsCards
        globalStats={globalStats}
        stats={stats}
        cardFilter={cardFilter}
        onCardClick={handleCardClick}
        onClearCardFilter={clearCardFilter}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">Todos os Envios</TabsTrigger>
          <TabsTrigger value="delayed" className="gap-2">
            Atrasados
            {globalStats.delayed > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5">{globalStats.delayed}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por código, pedido ou destinatário..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); if (e.target.value.length >= 3 || e.target.value.length === 0) setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
              {activeTab === 'all' && (
                <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
                  <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
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
                  <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Dias de atraso" /></SelectTrigger>
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
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Transportadora" /></SelectTrigger>
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

        <Card className="mt-4">
          <CardContent className="p-0">
            <EnviosShipmentsTable
              shipments={filteredShipments}
              activeTab={activeTab}
              isLoading={isLoading}
              isUpdatingShipment={isUpdatingShipment}
              search={search}
              statusFilter={statusFilter}
              carrierFilter={carrierFilter}
              onRowClick={setSelectedShipment}
              onUpdateSingle={handleUpdateSingleShipment}
            />
          </CardContent>
          <EnviosPagination
            totalCount={totalCount}
            displayedCount={shipments.length}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(parseInt(size)); setCurrentPage(1); }}
          />
        </Card>
      </Tabs>

      <ShipmentDetailsDialog
        shipment={selectedShipment}
        open={!!selectedShipment}
        onOpenChange={(open) => !open && setSelectedShipment(null)}
        onRefresh={handleUpdateSingleShipment}
        isRefreshing={isUpdatingShipment}
      />
      <MelhorEnvioDialog open={showIntegrationDialog} onOpenChange={setShowIntegrationDialog} />
    </div>
  );
}
