import { useState, useEffect } from "react";
import { Users, Search, Phone, Mail, MapPin, Eye, ChevronLeft, ChevronRight, ArrowLeft, RefreshCw, Clock, CheckCircle, ShoppingBag, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import BlingClientDetailsDialog from "@/components/clients/BlingClientDetailsDialog";
import type { Tables } from "@/integrations/supabase/types";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useBlingSync } from "@/hooks/useBlingSync";
import { useExportCSV } from "@/hooks/useExportCSV";

import { createLogger } from '@/lib/logger';
const log = createLogger('BlingClientsContent');

interface BlingClientsContentProps {
  integrationId: string;
}

export function BlingClientsContent({ integrationId }: BlingClientsContentProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { syncStatus, currentJob, startSync } = useBlingSync(integrationId, 'customers');
  const { exportToCSV, isExporting } = useExportCSV();
  const [selectedClient, setSelectedClient] = useState<Tables<"bling_customers"> | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Export function
  const handleExportClients = async () => {
    // Fetch all clients for export
    const { data: allClients, error } = await supabase
      .from('bling_customers')
      .select('nome, email, celular, telefone, cpf_cnpj, endereco')
      .eq('integration_id', integrationId)
      .order('nome', { ascending: true });
    
    if (error || !allClients) {
      toast({
        title: "Erro na exportação",
        description: "Não foi possível buscar os clientes.",
        variant: "destructive"
      });
      return;
    }

    await exportToCSV({
      filename: 'clientes-bling',
      headers: ['Nome', 'Email', 'Celular', 'Telefone', 'CPF/CNPJ', 'Cidade', 'UF'],
      data: allClients.map(c => {
        const endereco = c.endereco as any;
        const enderecoGeral = endereco?.geral || endereco;
        return [
          c.nome,
          c.email,
          c.celular,
          c.telefone,
          c.cpf_cnpj,
          enderecoGeral?.municipio,
          enderecoGeral?.uf
        ];
      })
    });
  };

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

  // Get most recent sync date
  const getMostRecentSync = (int: typeof integration): string | null => {
    if (!int) return null;
    const dates = [
      int.last_customers_sync_at,
      int.last_sync_customers_at,
      int.last_sync_at,
    ].filter(Boolean) as string[];
    
    if (dates.length === 0) return null;
    return dates.reduce((latest, current) => 
      new Date(current) > new Date(latest) ? current : latest
    );
  };

  // Get total count
  const { data: totalCount, refetch: refetchCount } = useQuery({
    queryKey: ['bling-clients-count', integrationId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('bling_customers')
        .select('id', { count: 'exact', head: true })
        .eq('integration_id', integrationId);
      
      if (error) throw error;
      return count || 0;
    }
  });

  // Fetch paginated clients with search
  const { data: clients, isLoading, refetch: refetchClients } = useQuery({
    queryKey: ['bling-clients', integrationId, currentPage, pageSize, searchTerm],
    queryFn: async () => {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('bling_customers')
        .select('id, bling_id, integration_id, nome, fantasia, email, celular, telefone, cpf_cnpj, endereco, data_nascimento, data_inclusao, tipo_pessoa, sexo, situacao, ie, naturalidade, orgao_emissor, rg, raw_data, synced_at, tenant_id, created_at, updated_at')
        .eq('integration_id', integrationId)
        .order('nome', { ascending: true });

      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`nome.ilike.${term},email.ilike.${term},celular.ilike.${term},telefone.ilike.${term},cpf_cnpj.ilike.${term}`);
      }

      query = query.range(from, to);

      const { data, error } = await query;
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch order counts per client
  const clientBlingIds = clients?.map(c => c.bling_id) || [];
  const { data: orderCounts } = useQuery({
    queryKey: ['bling-client-order-counts', integrationId, clientBlingIds],
    queryFn: async () => {
      if (clientBlingIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from('bling_orders')
        .select('cliente_id')
        .eq('integration_id', integrationId)
        .in('cliente_id', clientBlingIds);
      
      if (error) throw error;
      
      // Count orders per client
      const counts: Record<number, number> = {};
      data?.forEach(order => {
        if (order.cliente_id) {
          counts[order.cliente_id] = (counts[order.cliente_id] || 0) + 1;
        }
      });
      return counts;
    },
    enabled: clientBlingIds.length > 0
  });

  // Get filtered count for search
  const { data: filteredCount } = useQuery({
    queryKey: ['bling-clients-filtered-count', integrationId, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('bling_customers')
        .select('id', { count: 'exact', head: true })
        .eq('integration_id', integrationId);

      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`nome.ilike.${term},email.ilike.${term},celular.ilike.${term},telefone.ilike.${term},cpf_cnpj.ilike.${term}`);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: searchTerm.trim().length > 0
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`bling-customers-${integrationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bling_customers',
          filter: `integration_id=eq.${integrationId}`
        },
        () => {
          refetchClients();
          refetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [integrationId, refetchClients, refetchCount]);

  const displayCount = searchTerm.trim() ? (filteredCount ?? 0) : (totalCount ?? 0);
  const totalPages = Math.ceil(displayCount / pageSize);

  // Refetch when sync completes
  useEffect(() => {
    if (syncStatus === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['bling-clients', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['bling-clients-count', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['integration-info', integrationId] });
    }
  }, [syncStatus, integrationId, queryClient]);

  const handleSync = async () => {
    try {
      toast({
        title: "Sincronização iniciada",
        description: "Sincronizando clientes a partir das vendas..."
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

  const formatPhone = (phone: string | null) => {
    if (!phone) return '-';
    return phone;
  };

  const getInitials = (name: string | null) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "Nunca";
    }
  };

  const handleViewDetails = (client: Tables<"bling_customers">) => {
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

  const isSyncing = syncStatus === 'syncing';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{integration?.name || 'Clientes Bling'}</h1>
            <p className="text-muted-foreground">
              Clientes extraídos das vendas sincronizadas
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <SyncStatusBadge integrationId={integrationId} syncType="customers" />
          <Button
            variant="outline"
            onClick={handleExportClients}
            disabled={isExporting || !totalCount}
          >
            <Download className={`h-4 w-4 mr-2 ${isExporting ? 'animate-pulse' : ''}`} />
            {isExporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
          <DeleteIntegrationDataButton
            integrationId={integrationId}
            dataType="clientes"
            tablesToDelete={[{ table: 'bling_customers' }]}
            onDeleted={() => {
              queryClient.invalidateQueries({ queryKey: ['bling-clients', integrationId] });
              queryClient.invalidateQueries({ queryKey: ['bling-clients-count', integrationId] });
            }}
          />
          <Button 
            variant="outline" 
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : syncStatus === 'completed' ? (
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {isSyncing 
              ? `Sincronizando... ${currentJob?.saved_count || 0}` 
              : syncStatus === 'completed'
              ? 'Concluído!'
              : 'Sincronizar Clientes'}
          </Button>
        </div>
      </div>

      {/* Sync Progress */}
      {isSyncing && currentJob && currentJob.total_count > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Sincronizando clientes...</span>
                <span>{currentJob.saved_count} de {currentJob.total_count}</span>
              </div>
              <Progress 
                value={(currentJob.saved_count / currentJob.total_count) * 100} 
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
            placeholder="Buscar por nome, email, telefone, CPF/CNPJ..."
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
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden xl:table-cell">CPF/CNPJ</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground hidden sm:table-cell">Vendas</th>
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
                  <td className="px-4 py-3 hidden xl:table-cell"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-6 w-8 mx-auto" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-8 w-8 ml-auto" /></td>
                </tr>
              ))
            ) : clients?.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente sincronizado ainda'}
                  </p>
                  {!searchTerm && (
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Sincronize as vendas primeiro e depois clique em "Sincronizar Clientes"
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              clients?.map((client) => {
                const endereco = client.endereco as any;
                const enderecoGeral = endereco?.geral || endereco;
                const cidade = enderecoGeral?.municipio || '';
                const uf = enderecoGeral?.uf || '';
                const cidadeUf = cidade && uf ? `${cidade}/${uf}` : cidade || uf || '';
                const isConsumidorFinal = client.nome?.toLowerCase().includes('consumidor final');
                const clientOrderCount = orderCounts?.[client.bling_id] || 0;

                return (
                  <tr 
                    key={client.id} 
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                          {getInitials(client.nome)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-foreground">{client.nome || 'Sem nome'}</p>
                            {isConsumidorFinal && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">Balcão</Badge>
                            )}
                          </div>
                          {client.fantasia && (
                            <p className="text-xs text-muted-foreground">{client.fantasia}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {client.celular || client.telefone ? (
                          <span className="text-foreground">{client.celular || client.telefone}</span>
                        ) : (
                          <span className="text-muted-foreground/60 italic">Sem telefone</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {client.email ? (
                          <span className="truncate max-w-[200px] text-foreground">{client.email}</span>
                        ) : (
                          <span className="text-muted-foreground/60 italic">Sem email</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {cidadeUf ? (
                          <span className="text-foreground">{cidadeUf}</span>
                        ) : (
                          <span className="text-muted-foreground/60 italic">Sem localização</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {client.cpf_cnpj ? (
                        <span className="text-sm font-mono text-foreground">{client.cpf_cnpj}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground/60 italic">Não informado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-center">
                      {clientOrderCount > 0 ? (
                        <Badge variant="secondary" className="text-xs font-medium">
                          <ShoppingBag className="h-3 w-3 mr-1" />
                          {clientOrderCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/60 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewDetails(client)}
                        className="h-8 w-8"
                        title="Ver vendas do cliente"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, displayCount)} de {displayCount} clientes
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            {getPageNumbers().map((page, idx) => (
              typeof page === 'number' ? (
                <Button
                  key={idx}
                  variant={page === currentPage ? 'default' : 'outline'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(page)}
                >
                  {page}
                </Button>
              ) : (
                <span key={idx} className="px-2 text-muted-foreground">...</span>
              )
            ))}
            
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Details Dialog */}
      <BlingClientDetailsDialog
        client={selectedClient}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
