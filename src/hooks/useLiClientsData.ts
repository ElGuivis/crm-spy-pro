import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSyncStatus } from "@/hooks/useSyncStatus";

const LI_CUSTOMER_COLUMNS = "id, integration_id, loja_integrada_customer_id, name, email, phone, doc, address_json, raw_json, tenant_id, updated_at_local, updated_at_remote";

export function useLiClientsData(integrationId: string) {
  const queryClient = useQueryClient();
  const sync = useSyncStatus(integrationId, "customers");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const { data: integration } = useQuery({
    queryKey: ["integration-info", integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("integrations")
        .select("name, last_customers_sync_at, last_sync_customers_at, last_sync_at")
        .eq("id", integrationId).single();
      return data;
    },
  });

  const { data: totalCount, refetch: refetchCount } = useQuery({
    queryKey: ["li-clients-count", integrationId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("li_customers")
        .select("id", { count: "exact", head: true })
        .eq("integration_id", integrationId);
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: clients, isLoading, refetch: refetchClients } = useQuery({
    queryKey: ["li-clients", integrationId, currentPage, pageSize, searchTerm],
    queryFn: async () => {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase.from("li_customers").select(LI_CUSTOMER_COLUMNS)
        .eq("integration_id", integrationId).order("name", { ascending: true });
      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term},doc.ilike.${term}`);
      }
      const { data, error } = await query.range(from, to);
      if (error) throw error;
      return data;
    },
  });

  const { data: filteredCount } = useQuery({
    queryKey: ["li-clients-filtered-count", integrationId, searchTerm],
    queryFn: async () => {
      let query = supabase.from("li_customers").select("id", { count: "exact", head: true })
        .eq("integration_id", integrationId);
      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term},doc.ilike.${term}`);
      }
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: searchTerm.trim().length > 0,
  });

  // Realtime with debounce
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel(`customers-${integrationId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "li_customers", filter: `integration_id=eq.${integrationId}` },
        () => {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            refetchClients();
            refetchCount();
          }, 500);
        })
      .subscribe();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [integrationId, refetchClients, refetchCount]);

  // Invalidate on sync complete
  useEffect(() => {
    if (sync.syncStatus.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["li-clients", integrationId] });
      queryClient.invalidateQueries({ queryKey: ["li-clients-count", integrationId] });
      queryClient.invalidateQueries({ queryKey: ["integration-info", integrationId] });
      supabase.from("integrations").update({
        last_customers_sync_at: new Date().toISOString(),
        initial_sync_completed: true,
      }).eq("id", integrationId);
    }
  }, [sync.syncStatus.status, integrationId, queryClient]);

  const displayCount = searchTerm.trim() ? (filteredCount ?? 0) : (totalCount ?? 0);
  const totalPages = Math.ceil(displayCount / pageSize);

  const handleSearch = (value: string) => { setSearchTerm(value); setCurrentPage(1); };
  const handlePageSizeChange = (value: string) => { setPageSize(Number(value)); setCurrentPage(1); };
  const goToPage = (page: number) => { if (page >= 1 && page <= totalPages) setCurrentPage(page); };

  return {
    integration, clients, isLoading, totalCount,
    searchTerm, currentPage, pageSize, displayCount, totalPages,
    handleSearch, handlePageSizeChange, goToPage,
    sync,
  };
}
