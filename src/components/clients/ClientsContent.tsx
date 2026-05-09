import { useState, useEffect, useRef } from "react";
import { Users, Search, Phone, Mail, MapPin, Cake, Eye, ChevronLeft, ChevronRight, ArrowLeft, RefreshCw, Zap, Clock, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import ClientDetailsDialog from "@/components/clients/ClientDetailsDialog";
import type { Tables } from "@/integrations/supabase/types";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { SyncProgressBanner } from "@/components/common/SyncProgressBanner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useSyncStatus } from "@/hooks/useSyncStatus";

import { createLogger } from '@/lib/logger';
const log = createLogger('ClientsContent');

interface ClientsContentProps {
  integrationId: string;
}

export function ClientsContent({ integrationId }: ClientsContentProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { syncStatus, startSync } = useSyncStatus(integrationId, 'customers');
  const [selectedClient, setSelectedClient] = useState<Tables<"li_customers"> | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [checkingNew, setCheckingNew] = useState(false);

  // Fetch integration info
  const { data: integration } = useQuery({
    queryKey: ['integration-info', integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integrations')
        .select('name, last_customers_sync_at, last_sync_customers_at, last_sync_at')
        .eq('id', integrationId)
        .single();
      return data;
    }
  });

  // Helper to get the most recent sync date
  const getMostRecentSync = (integration: any): string | null => {
    if (!integration) return null;
    const dates = [
      integration.last_customers_sync_at,
      integration.last_sync_customers_at,
      integration.last_sync_at,
    ].filter(Boolean);
    
    if (dates.length === 0) return null;
    return dates.reduce((latest, current) => 
      new Date(current) > new Date(latest) ? current : latest
    );
  };

  // Get total count
  const { data: totalCount, refetch: refetchCount } = useQuery({
    queryKey: ['li-clients-count', integrationId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('li_customers')
        .select('id', { count: 'exact', head: true })
        .eq('integration_id', integrationId);
      
      if (error) throw error;
      return count || 0;
    }
  });

  // Fetch paginated clients with search
  const { data: clients, isLoading, refetch: refetchClients } = useQuery({
    queryKey: ['li-clients', integrationId, currentPage, pageSize, searchTerm],
    queryFn: async () => {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('li_customers')
        .select('id, integration_id, loja_integrada_customer_id, name, email, phone, doc, address_json, raw_json, tenant_id, updated_at_local, updated_at_remote')
        .eq('integration_id', integrationId)
        .order('name', { ascending: true });

      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term},doc.ilike.${term}`);
      }

      query = query.range(from, to);

      const { data, error } = await query;
      
      if (error) throw error;
      return data;
    }
  });

  // Get filtered count for search
  const { data: filteredCount } = useQuery({
    queryKey: ['li-clients-filtered-count', integrationId, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('li_customers')
        .select('id', { count: 'exact', head: true })
        .eq('integration_id', integrationId);

      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term},doc.ilike.${term}`);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: searchTerm.trim().length > 0
  });

  // Debounce ref for realtime updates
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime subscription with debounce
  useEffect(() => {
    const channel = supabase
      .channel(`customers-${integrationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'li_customers',
          filter: `integration_id=eq.${integrationId}`
        },
        () => {
          // Debounce to avoid multiple refetches during batch syncs
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            refetchClients();
            refetchCount();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [integrationId, refetchClients, refetchCount]);

  const displayCount = searchTerm.trim() ? (filteredCount ?? 0) : (totalCount ?? 0);
  const totalPages = Math.ceil(displayCount / pageSize);

  // Refetch when sync completes
  useEffect(() => {
    if (syncStatus.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['li-clients', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['li-clients-count', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['integration-info', integrationId] });
      
      supabase
        .from('integrations')
        .update({ 
          last_customers_sync_at: new Date().toISOString(),
          initial_sync_completed: true
        })
        .eq('id', integrationId);
    }
  }, [syncStatus.status, integrationId, queryClient]);

  const handleSync = async () => {
    try {
      toast({
        title: "Sincronização iniciada",
        description: "Sincronizando clientes em segundo plano..."
      });

      await startSync();
    } catch (error: any) {
      log.error('Sync error:', error);
      toast({
        title: "Erro na sincronização",
        description: error.message || "Não foi possível iniciar a sincronização.",
        variant: "destructive"
      });
    }
  };

  const handleCheckNew = async () => {
    try {
      setCheckingNew(true);
      toast({
        title: "Verificando novos clientes",
        description: "Buscando clientes novos..."
      });

      const { error } = await supabase.functions.invoke('li-reconciliation-processor', {
        body: { manual: true, integrationId, syncType: 'customers' }
      });

      if (error) throw error;

      toast({
        title: "Verificação concluída",
        description: "Clientes atualizados com sucesso."
      });

      queryClient.invalidateQueries({ queryKey: ['li-clients', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['li-clients-count', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['integration-info', integrationId] });
    } catch (error: any) {
      log.error('Check new error:', error);
      toast({
        title: "Erro ao verificar",
        description: error.message || "Não foi possível verificar novos clientes.",
        variant: "destructive"
      });
    } finally {
      setCheckingNew(false);
    }
  };

  const formatPhone = (phone: string | null) => {
    if (!phone) return '-';
    return phone;
  };

  const getInitials = (name: string | null) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const formatBirthDate = (date: string | null) => {
    if (!date) return null;
    try {
      return format(parseISO(date), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return null;
    }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "Nunca";
    }
  };

  const handleViewDetails = (client: Tables<"li_customers">) => {
    setSelectedClient(client);
    setDetailsOpen(true);
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="space-y-6 p-6">
      <SyncProgressBanner integrationId={integrationId} entityType="customers" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{integration?.name || 'Clientes'}</h1>
            <p className="text-muted-foreground">
              Gerencie os clientes desta loja
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <SyncStatusBadge integrationId={integrationId} syncType="customers" />
          <DeleteIntegrationDataButton
            integrationId={integrationId}
            dataType="clientes"
            tablesToDelete={[{ table: 'li_customers' }]}
            onDeleted={() => {
              queryClient.invalidateQueries({ queryKey: ['li-clients', integrationId] });
              queryClient.invalidateQueries({ queryKey: ['li-clients-count', integrationId] });
            }}
          />
          <Button 
            variant="outline" 
            onClick={handleCheckNew}
            disabled={checkingNew || syncStatus.isActive}
          >
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
        </div>
      </div>


      {/* Sync Progress */}
      {syncStatus.isActive && syncStatus.progress.total > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Sincronizando clientes...</span>
                <span>{syncStatus.progress.saved} de {syncStatus.progress.total}</span>
              </div>
              <Progress 
                value={(syncStatus.progress.saved / syncStatus.progress.total) * 100} 
                className="h-2"
              />
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
                <p className="text-sm text-muted-foreground">Clientes</p>
                <p className="text-2xl font-bold">{totalCount?.toLocaleString('pt-BR') || 0}</p>
              </div>
              <Users className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
              <p className="text-sm text-muted-foreground">Última Sincronização</p>
                <p className="text-sm font-medium">
                  {formatLastSync(getMostRecentSync(integration))}
                </p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome, email, telefone, CPF ou CNPJ..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15 por página</SelectItem>
            <SelectItem value="30">30 por página</SelectItem>
            <SelectItem value="50">50 por página</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clients Table */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Cliente</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden sm:table-cell">Telefone</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden md:table-cell">Email</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden lg:table-cell">Cidade/UF</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden xl:table-cell">Nascimento</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden xl:table-cell">CPF/CNPJ</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-36" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3 hidden xl:table-cell"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3 hidden xl:table-cell"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-8 w-8 ml-auto" /></td>
                </tr>
              ))
            ) : clients?.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    {searchTerm.trim() ? 'Nenhum cliente encontrado' : 'Nenhum cliente sincronizado ainda'}
                  </p>
                  {!searchTerm.trim() && (
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={handleSync}
                      disabled={syncStatus.isActive}
                    >
                      Sincronizar Clientes
                    </Button>
                  )}
                </td>
              </tr>
            ) : (
              clients?.map((client) => (
                <tr 
                  key={client.id} 
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => handleViewDetails(client)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full gradient-whatsapp flex items-center justify-center text-primary-foreground font-semibold text-sm">
                        {getInitials(client.name)}
                      </div>
                      <div>
                        <p className="font-medium text-card-foreground">{client.name || 'Sem nome'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {formatPhone(client.phone)}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      {client.email || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {(() => {
                        // Try address_json first, fallback to raw_json.enderecos
                        let addr = client.address_json as any;
                        if (!addr || (!addr.cidade && !addr.estado)) {
                          const raw = client.raw_json as any;
                          const enderecos = Array.isArray(raw?.enderecos) ? raw.enderecos : [];
                          addr = enderecos.find((e: any) => e.principal) || enderecos[0] || null;
                        }
                        return addr?.cidade && addr?.estado ? `${addr.cidade}/${addr.estado}` : '-';
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {(() => {
                        const raw = client.raw_json as any;
                        if (!raw?.data_nascimento) return '-';
                        try {
                          return format(parseISO(raw.data_nascimento), "dd/MM/yyyy", { locale: ptBR });
                        } catch { return '-'; }
                      })()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground hidden xl:table-cell">
                    {client.doc || '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDetails(client);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, displayCount)} de {displayCount.toLocaleString('pt-BR')} clientes
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Anterior</span>
            </Button>
            
            <div className="flex items-center gap-1 mx-2">
              {getPageNumbers().map((page, index) => (
                typeof page === 'number' ? (
                  <Button
                    key={index}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => goToPage(page)}
                    className="w-8 h-8 p-0"
                  >
                    {page}
                  </Button>
                ) : (
                  <span key={index} className="px-2 text-muted-foreground">...</span>
                )
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="gap-1"
            >
              <span className="hidden sm:inline">Próxima</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ClientDetailsDialog 
        client={selectedClient} 
        open={detailsOpen} 
        onOpenChange={setDetailsOpen} 
      />
    </div>
  );
}
