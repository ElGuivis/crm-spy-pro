import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "./products-helpers";
import { LI_PRODUCT_SELECT } from './product-select-columns';

/** Consultas dos produtos da Loja Integrada + realtime + atualização ao concluir a sincronização. */
export function useProductsQueries(integrationId: string, syncStatusValue: string) {
  const queryClient = useQueryClient();

  const { data: integration } = useQuery({
    queryKey: ['integration-info', integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integrations')
        .select('name, last_sync_at, last_sync_products_at, last_products_sync_at')
        .eq('id', integrationId)
        .maybeSingle();
      return data;
    }
  });

  const { data: totalProductsCount } = useQuery({
    queryKey: ['li-products-count', integrationId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('li_products')
        .select('id', { count: 'exact', head: true })
        .eq('integration_id', integrationId)
        .eq('active', true);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!integrationId,
  });

  const { data: allProducts, isLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['li-products-all', integrationId],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const allRows: Product[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('li_products')
          .select(LI_PRODUCT_SELECT)
          .eq('integration_id', integrationId)
          .eq('active', true)
          .order('name', { ascending: true })
          .range(from, from + pageSize - 1)
          .returns<Product[]>();
        if (error) throw error;
        allRows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      return allRows;
    },
    enabled: !!integrationId,
  });

  // Realtime subscription
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel(`products-${integrationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'li_products', filter: `integration_id=eq.${integrationId}` }, () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          refetchProducts();
          queryClient.invalidateQueries({ queryKey: ['li-products-count', integrationId] });
        }, 500);
      })
      .subscribe();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [integrationId, refetchProducts, queryClient]);

  useEffect(() => {
    if (syncStatusValue === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['li-products-all', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['li-products-count', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['integration-info', integrationId] });
      const now = new Date().toISOString();
      supabase.from('integrations').update({ last_products_sync_at: now, last_sync_products_at: now, last_sync_at: now, initial_sync_completed: true }).eq('id', integrationId);
    }
  }, [syncStatusValue, integrationId, queryClient]);

  return { integration, totalProductsCount, allProducts, isLoading };
}
