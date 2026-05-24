import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBlingSync } from "@/hooks/useBlingSync";

const BLING_CUSTOMER_COLUMNS = "id, bling_id, integration_id, nome, fantasia, email, celular, telefone, cpf_cnpj, endereco, data_nascimento, data_inclusao, tipo_pessoa, sexo, situacao, ie, naturalidade, orgao_emissor, rg, raw_data, synced_at, tenant_id, created_at, updated_at";

export function useBlingClientsData(integrationId: string) {
  const queryClient = useQueryClient();
  const sync = useBlingSync(integrationId, 'customers');
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const { data: integration } = useQuery({
    queryKey: ['integration-info', integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integrations')
        .select('name, last_customers_sync_at, last_sync_customers_at, last_sync_at')
        .eq('id', integrationId).single();
      return data;
    }
  });

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

  const { data: clients, isLoading, refetch: refetchClients } = useQuery({
    queryKey: ['bling-clients', integrationId, currentPage, pageSize, searchTerm],
    queryFn: async () => {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase.from('bling_customers').select(BLING_CUSTOMER_COLUMNS)
        .eq('integration_id', integrationId).order('nome', { ascending: true });
      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`nome.ilike.${term},email.ilike.${term},celular.ilike.${term},telefone.ilike.${term},cpf_cnpj.ilike.${term}`);
      }
      const { data, error } = await query.range(from, to);
      if (error) throw error;
      return data;
    }
  });

  const clientBlingIds = clients?.map(c => c.bling_id) || [];
  const { data: orderCounts } = useQuery({
    queryKey: ['bling-client-order-counts', integrationId, clientBlingIds],
    queryFn: async () => {
      if (clientBlingIds.length === 0) return {};
      const { data, error } = await supabase
        .from('bling_orders').select('cliente_id')
        .eq('integration_id', integrationId).in('cliente_id', clientBlingIds);
      if (error) throw error;
      const counts: Record<number, number> = {};
      data?.forEach(order => {
        if (order.cliente_id) counts[order.cliente_id] = (counts[order.cliente_id] || 0) + 1;
      });
      return counts;
    },
    enabled: clientBlingIds.length > 0
  });

  const { data: filteredCount } = useQuery({
    queryKey: ['bling-clients-filtered-count', integrationId, searchTerm],
    queryFn: async () => {
      let query = supabase.from('bling_customers').select('id', { count: 'exact', head: true })
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

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`bling-customers-${integrationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bling_customers', filter: `integration_id=eq.${integrationId}` }, () => {
        refetchClients();
        refetchCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [integrationId, refetchClients, refetchCount]);

  // Invalidate on sync complete
  useEffect(() => {
    if (sync.syncStatus === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['bling-clients', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['bling-clients-count', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['integration-info', integrationId] });
    }
  }, [sync.syncStatus, integrationId, queryClient]);

  const displayCount = searchTerm.trim() ? (filteredCount ?? 0) : (totalCount ?? 0);
  const totalPages = Math.ceil(displayCount / pageSize);

  const handleSearch = (value: string) => { setSearchTerm(value); setCurrentPage(1); };
  const handlePageSizeChange = (value: string) => { setPageSize(Number(value)); setCurrentPage(1); };
  const goToPage = (page: number) => { if (page >= 1 && page <= totalPages) setCurrentPage(page); };

  return {
    integration, clients, isLoading, totalCount, orderCounts,
    searchTerm, currentPage, pageSize, displayCount, totalPages,
    handleSearch, handlePageSizeChange, goToPage,
    sync,
  };
}
