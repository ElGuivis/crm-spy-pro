import { useState, useMemo, useCallback, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type CatalogProduct, type BlingProductRow, type LiCatalogRow, normalizeBlingProducts, normalizeLiCatalogRows,
} from "@/components/catalogo/catalogoHelpers";
import {
  type CatalogFilterState, DEFAULT_CATALOG_FILTERS, applyCatalogFilters, baseCatalog, buildCatalogFilterOptions,
} from "@/components/catalogo/catalogFilters";
import { linkBlingVariations } from "@/components/catalogo/blingVariations";
import { fetchBlingStockRows } from "@/components/catalogo/blingStockRows";

const BLING_PAGE = 1000; // limite de linhas por resposta do PostgREST

async function fetchAllBling(integrationId: string): Promise<BlingProductRow[]> {
  const all: BlingProductRow[] = [];
  for (let from = 0; ; from += BLING_PAGE) {
    const { data, error } = await supabase.from("bling_products")
      .select("id, bling_id, nome, preco, estoque_atual, imagem_url, imagens, codigo, variacoes, created_at")
      .eq("integration_id", integrationId).is("produto_pai_id", null)
      .order("id").range(from, from + BLING_PAGE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as BlingProductRow[]));
    if (!data || data.length < BLING_PAGE) return all;
  }
}

/** Catálogo WhatsApp (página e envio pelo atendimento): produtos, filtros e seleção. */
export function useCatalogoProducts(integrationId: string, enabled = true) {
  const [filters, setFilters] = useState<CatalogFilterState>(DEFAULT_CATALOG_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** fotos escolhidas por produto (ordem do envio); sem escolha vale a principal */
  const [photoChoice, setPhotoChoice] = useState<Record<string, string[]>>({});

  const setFilter = useCallback(<K extends keyof CatalogFilterState>(key: K, value: CatalogFilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);
  const resetFilters = useCallback(() => setFilters(prev => ({ ...DEFAULT_CATALOG_FILTERS, sort: prev.sort })), []);

  const { data: integration } = useQuery({
    queryKey: ["catalogo-integration", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("integrations").select("name, type").eq("id", integrationId).maybeSingle();
      return data;
    },
    enabled: enabled && !!integrationId,
  });

  const isBling = integration?.type === "bling";

  // Loja Integrada: já agrupado no banco (pai + variações em estoque + fotos); ler li_products direto esbarrava no limite de 1000 linhas
  const { data: liProducts, isLoading: liLoading, error: liError } = useQuery({
    queryKey: ["catalogo-li-products", integrationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_catalog_products", { p_integration_id: integrationId });
      if (error) throw error;
      return normalizeLiCatalogRows((data ?? []) as LiCatalogRow[]);
    },
    enabled: enabled && !!integration && !isBling,
    staleTime: 60_000,
  });

  const { data: blingProducts, isLoading: blingLoading, error: blingError } = useQuery({
    queryKey: ["catalogo-bling-products", integrationId],
    queryFn: async () => {
      const [parents, rows] = await Promise.all([fetchAllBling(integrationId), fetchBlingStockRows(integrationId)]);
      const { kids, variantIds } = linkBlingVariations(parents, rows);
      // variação ainda sem produto_pai_id não vira produto próprio (sairia duplicado, com "Tamanho:P" no nome)
      return normalizeBlingProducts(parents.filter(p => p.bling_id == null || !variantIds.has(Number(p.bling_id))), kids);
    },
    enabled: enabled && !!integration && isBling,
    staleTime: 60_000,
  });

  const products: CatalogProduct[] = useMemo(
    () => (isBling ? blingProducts : liProducts) ?? [],
    [isBling, liProducts, blingProducts],
  );

  const base = useMemo(
    () => baseCatalog(products, { onlyInStock: filters.onlyInStock, includeOffSite: filters.includeOffSite }),
    [products, filters.onlyInStock, filters.includeOffSite],
  );
  const filterOptions = useMemo(() => buildCatalogFilterOptions(base.visible), [base.visible]);

  const deferredFilters = useDeferredValue(filters);
  const filtered = useMemo(() => applyCatalogFilters(base.visible, deferredFilters), [base.visible, deferredFilters]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /** marca todos os produtos visíveis; se já estão todos marcados, desmarca só eles */
  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));
  const selectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const p of filtered) { if (allFilteredSelected) next.delete(p.id); else next.add(p.id); }
      return next;
    });
  };

  const clearSelection = () => { setSelectedIds(new Set()); setPhotoChoice({}); };

  const setPhotos = (id: string, urls: string[]) => setPhotoChoice(prev => ({ ...prev, [id]: urls }));
  const photoCount = (p: CatalogProduct) => photoChoice[p.id]?.length ?? (p.imageUrl ? 1 : 0);

  // a seleção vale para o catálogo inteiro (mudar filtro não tira produto já marcado do envio)
  const selectedProducts: CatalogProduct[] = useMemo(() => products
    .filter(p => selectedIds.has(p.id))
    .map(p => ({ ...p, sendImages: photoChoice[p.id]?.length ? photoChoice[p.id] : (p.imageUrl ? [p.imageUrl] : []) })),
  [products, selectedIds, photoChoice]);

  return {
    integration, isLoading: liLoading || blingLoading, error: liError ?? blingError,
    products, filtered, filterOptions, selectedProducts,
    filters, setFilter, resetFilters,
    hiddenWithoutPhoto: base.withoutPhoto, offSiteCount: base.offSite,
    selectedIds, toggleSelect, selectAll, allFilteredSelected, clearSelection,
    photoChoice, setPhotos, photoCount,
  };
}

export type CatalogoState = ReturnType<typeof useCatalogoProducts>;
