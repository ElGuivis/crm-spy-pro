import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type CatalogProduct, normalizeBlingProducts, normalizeLiProducts,
  buildFilterOptions, filterCatalogProducts,
} from "@/components/catalogo/catalogoHelpers";

export function useCatalogoProducts(integrationId: string, enabled = true) {
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [colorFilter, setColorFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data: integration } = useQuery({
    queryKey: ["catalogo-integration", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("integrations").select("name, type").eq("id", integrationId).maybeSingle();
      return data;
    },
    enabled: enabled && !!integrationId,
  });

  const isBling = integration?.type === "bling";

  const { data: liProducts, isLoading: liLoading } = useQuery({
    queryKey: ["catalogo-li-products", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("li_products")
        .select("id, name, price, promotional_price, stock, image_url, sku, variations_json, raw_json, loja_integrada_product_id")
        .eq("integration_id", integrationId).eq("active", true);
      return data || [];
    },
    enabled: enabled && !!integrationId && !isBling,
  });

  const { data: blingProducts, isLoading: blingLoading } = useQuery({
    queryKey: ["catalogo-bling-products", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("bling_products")
        .select("id, nome, preco, estoque_atual, imagem_url, imagens, codigo, variacoes")
        .eq("integration_id", integrationId).is("produto_pai_id", null);
      return data || [];
    },
    enabled: enabled && !!integrationId && isBling === true,
  });

  const products: CatalogProduct[] = useMemo(() => {
    if (isBling && blingProducts) return normalizeBlingProducts(blingProducts);
    if (!isBling && liProducts) return normalizeLiProducts(liProducts);
    return [];
  }, [isBling, liProducts, blingProducts]);

  const filterOptions = useMemo(() => buildFilterOptions(products), [products]);

  const filtered = useMemo(
    () => filterCatalogProducts(products, { onlyInStock, searchQuery, colorFilter, sizeFilter, categoryFilter }),
    [products, onlyInStock, searchQuery, colorFilter, sizeFilter, categoryFilter]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedProducts = filtered.filter(p => selectedIds.has(p.id));

  return {
    integration, isLoading: liLoading || blingLoading,
    products, filtered, filterOptions, selectedProducts,
    searchQuery, setSearchQuery, onlyInStock, setOnlyInStock,
    colorFilter, setColorFilter, sizeFilter, setSizeFilter, categoryFilter, setCategoryFilter,
    selectedIds, toggleSelect, selectAll, clearSelection,
  };
}
