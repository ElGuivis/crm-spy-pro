import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type CatalogProduct, type LiCatalogRow, normalizeLiCatalogRows } from "@/components/catalogo/catalogoHelpers";
import {
  type CatalogFilterState, DEFAULT_CATALOG_FILTERS, applyCatalogFilters, buildCatalogFilterOptions,
} from "@/components/catalogo/catalogFilters";
import type { Product } from "./products-helpers";

const PRODUCTS_DEFAULTS: CatalogFilterState = { ...DEFAULT_CATALOG_FILTERS, onlyInStock: false };

/**
 * Filtros da página Produtos da Loja Integrada = os mesmos do Catálogo WhatsApp (23/11/2026):
 * busca, tipo, cor, tamanho e ordenação. Cor/tamanho e data de criação vêm da RPC
 * `get_catalog_products` (variações com os nomes das grades); estoque é o da própria página.
 */
export function useLiProductFilters(
  integrationId: string,
  parentProducts: Product[],
  getTotalStock: (p: Product) => number,
) {
  const [filters, setFilters] = useState<CatalogFilterState>(PRODUCTS_DEFAULTS);
  const setFilter = useCallback(<K extends keyof CatalogFilterState>(key: K, value: CatalogFilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);
  const resetFilters = useCallback(() => setFilters(prev => ({ ...PRODUCTS_DEFAULTS, sort: prev.sort })), []);

  const { data: catalogById } = useQuery({
    queryKey: ["li-products-variants", integrationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_catalog_products", { p_integration_id: integrationId });
      if (error) throw error;
      return new Map(normalizeLiCatalogRows((data ?? []) as LiCatalogRow[]).map(c => [c.id, c]));
    },
    staleTime: 5 * 60_000,
  });

  const { filterOptions, filteredProducts } = useMemo(() => {
    const byId = new Map<string, Product>();
    const all = parentProducts.map((p): CatalogProduct => {
      byId.set(p.id, p);
      const c = catalogById?.get(p.id);
      return {
        id: p.id,
        name: p.name ?? "",
        price: p.promotional_price || p.price || null,
        stock: getTotalStock(p),
        imageUrl: p.image_url,
        images: [],
        sku: p.sku,
        variations: [],
        variants: c?.variants ?? [],
        onSite: p.active !== false,
        createdAt: c?.createdAt ?? p.updated_at_remote ?? null,
        source: "li",
      };
    });
    const base = filters.onlyInStock ? all.filter(c => c.stock > 0) : all;
    return {
      filterOptions: buildCatalogFilterOptions(base),
      filteredProducts: applyCatalogFilters(base, filters).map(c => byId.get(c.id)!),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTotalStock muda junto com parentProducts
  }, [parentProducts, catalogById, filters]);

  const anyFilter = !!(filters.search || filters.type || filters.color || filters.size || filters.onlyInStock);

  return { filters, setFilter, resetFilters, filterOptions, filteredProducts, anyFilter };
}
