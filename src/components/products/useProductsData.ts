import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Product,
  SortOption,
  getRaw,
  getProductStock,
  normalizeLiId,
  getInlineVariationStock,
  calculateMargin,
  normalizeType,
  getBaseName,
} from "./products-helpers";
import { LI_PRODUCT_SELECT } from './product-select-columns';

export function useProductsData(integrationId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { syncStatus, startSync, cancelSync } = useSyncStatus(integrationId, 'products');
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkingNew, setCheckingNew] = useState(false);
  const [updatingStock, setUpdatingStock] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [marginRange, setMarginRange] = useState<[number, number]>([0, 100]);
  const [isPriceFilterActive, setIsPriceFilterActive] = useState(false);
  const [isMarginFilterActive, setIsMarginFilterActive] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);

  const { data: integration, refetch: refetchIntegration } = useQuery({
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

  const getMostRecentSync = (row: Record<string, unknown> | null): string | null => {
    if (!row) return null;
    const candidates = [row.last_sync_products_at, row.last_products_sync_at, row.last_sync_at].filter(Boolean) as string[];
    if (candidates.length === 0) return null;
    return candidates.reduce((latest, current) => (new Date(current) > new Date(latest) ? current : latest));
  };

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

  const { parentProducts, variationDataMap, parentCount, variationCount: totalVariationCount } = useMemo(() => {
    if (!allProducts) return { parentProducts: [] as Product[], variationDataMap: new Map<string, { count: number; stock: number }>(), parentCount: 0, variationCount: 0 };
    const parents: Product[] = [];
    const varMap = new Map<string, { count: number; stock: number }>();
    let varCount = 0;
    allProducts.forEach((p) => {
      const tipo = getRaw(p, 'tipo');
      if (tipo === 'atributo_opcao') {
        varCount++;
        const paiUri = getRaw(p, 'pai') as string | null;
        if (paiUri) {
          const match = (paiUri as string).match(/\/produto\/(\d+)/);
          if (match) {
            const parentKey = match[1];
            const current = varMap.get(parentKey) || { count: 0, stock: 0 };
            varMap.set(parentKey, { count: current.count + 1, stock: current.stock + getProductStock(p) });
          }
        }
      } else {
        parents.push(p);
      }
    });
    return { parentProducts: parents, variationDataMap: varMap, parentCount: parents.length, variationCount: varCount };
  }, [allProducts]);

  const getTotalStock = (product: Product): number => {
    const productKey = normalizeLiId(product.loja_integrada_product_id);
    const childStock = productKey ? variationDataMap?.get(productKey)?.stock || 0 : 0;
    const inlineStock = getInlineVariationStock(product);
    const variationCount = productKey ? variationDataMap?.get(productKey)?.count || 0 : 0;
    const hasInlineVariations = Array.isArray(product.variations_json) && (product.variations_json as unknown[]).length > 0;
    if (variationCount > 0 || hasInlineVariations) return childStock + inlineStock;
    return getProductStock(product);
  };

  const getVariationCount = (product: Product): number => {
    const productKey = normalizeLiId(product.loja_integrada_product_id);
    return productKey ? variationDataMap?.get(productKey)?.count || 0 : 0;
  };

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
    if (syncStatus.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['li-products-all', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['li-products-count', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['integration-info', integrationId] });
      const now = new Date().toISOString();
      supabase.from('integrations').update({ last_products_sync_at: now, last_sync_products_at: now, last_sync_at: now, initial_sync_completed: true }).eq('id', integrationId);
    }
  }, [syncStatus.status, integrationId, queryClient]);

  const imageMap = useMemo(() => {
    if (!parentProducts) return new Map<string, string>();
    const map = new Map<string, string>();
    parentProducts.forEach(product => {
      if (product.image_url) {
        const baseName = getBaseName(product.name);
        if (!map.has(baseName)) map.set(baseName, product.image_url);
      }
    });
    return map;
  }, [parentProducts]);

  const getProductImage = (product: Product) => {
    if (product.image_url) return product.image_url;
    const imagemPrincipal = getRaw(product, 'imagem_principal') as Record<string, string> | null;
    if (imagemPrincipal) {
      const url = imagemPrincipal?.grande || imagemPrincipal?.media || imagemPrincipal?.pequena;
      if (url) return url;
    }
    const baseName = getBaseName(product.name);
    return imageMap.get(baseName) || null;
  };

  const productTypes = useMemo(() => {
    if (!parentProducts) return [];
    const types = new Set<string>();
    parentProducts.forEach(product => {
      const type = normalizeType(product.name);
      if (type) types.add(type);
    });
    return Array.from(types).sort();
  }, [parentProducts]);

  const { maxPrice, maxMargin } = useMemo(() => {
    if (!parentProducts) return { maxPrice: 10000, maxMargin: 100 };
    let maxP = 0;
    let maxM = 0;
    parentProducts.forEach(product => {
      const price = product.promotional_price || product.price || 0;
      if (price > maxP) maxP = price;
      const margin = calculateMargin(product);
      if (margin !== null && margin > maxM) maxM = margin;
    });
    return { maxPrice: Math.ceil(maxP / 100) * 100, maxMargin: Math.min(Math.ceil(maxM / 10) * 10, 500) };
  }, [parentProducts]);

  const filteredProducts = useMemo(() => {
    if (!parentProducts) return [];
    const filtered = parentProducts.filter(product => {
      const matchesSearch = searchQuery === "" ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.sku && product.sku.toLowerCase().includes(searchQuery.toLowerCase()));
      const totalStock = getTotalStock(product);
      const matchesStock = !showOnlyInStock || totalStock > 0;
      const productType = normalizeType(product.name);
      const matchesType = selectedTypes.length === 0 || selectedTypes.includes(productType);
      const productPrice = product.promotional_price || product.price || 0;
      const matchesPrice = !isPriceFilterActive || (productPrice >= priceRange[0] && productPrice <= priceRange[1]);
      const margin = calculateMargin(product);
      const matchesMargin = !isMarginFilterActive || (margin !== null && margin >= marginRange[0] && margin <= marginRange[1]);
      return matchesSearch && matchesStock && matchesType && matchesPrice && matchesMargin;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc': return a.name.localeCompare(b.name, 'pt-BR');
        case 'name_desc': return b.name.localeCompare(a.name, 'pt-BR');
        case 'price_asc': return (a.promotional_price || a.price || 0) - (b.promotional_price || b.price || 0);
        case 'price_desc': return (b.promotional_price || b.price || 0) - (a.promotional_price || a.price || 0);
        case 'stock_asc': return getTotalStock(a) - getTotalStock(b);
        case 'stock_desc': return getTotalStock(b) - getTotalStock(a);
        case 'margin_asc': return (calculateMargin(a) ?? -Infinity) - (calculateMargin(b) ?? -Infinity);
        case 'margin_desc': return (calculateMargin(b) ?? -Infinity) - (calculateMargin(a) ?? -Infinity);
        default: return 0;
      }
    });
  }, [parentProducts, searchQuery, showOnlyInStock, selectedTypes, isPriceFilterActive, priceRange, isMarginFilterActive, marginRange, sortBy, variationDataMap]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, showOnlyInStock, selectedTypes, isPriceFilterActive, priceRange, isMarginFilterActive, marginRange, sortBy, variationDataMap]);

  const handleSync = async () => {
    try {
      toast({ title: "Sincronização iniciada", description: "Sincronizando produtos em segundo plano..." });
      await startSync();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Não foi possível iniciar a sincronização.";
      toast({ title: "Erro na sincronização", description: msg, variant: "destructive" });
    }
  };

  const handleCheckNew = async () => {
    try {
      setCheckingNew(true);
      toast({ title: "Verificando novos produtos", description: "Buscando produtos novos..." });
      const { error } = await supabase.functions.invoke('li-reconciliation-processor', { body: { manual: true, integrationId, syncType: 'products' } });
      if (error) throw error;
      toast({ title: "Verificação concluída", description: "Produtos atualizados com sucesso." });
      queryClient.invalidateQueries({ queryKey: ['li-products-all', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['li-products-count', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['integration-info', integrationId] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Não foi possível verificar novos produtos.";
      toast({ title: "Erro ao verificar", description: msg, variant: "destructive" });
    } finally {
      setCheckingNew(false);
    }
  };

  const handleUpdateStock = async () => {
    try {
      setUpdatingStock(true);
      toast({ title: "Atualizando estoque", description: "Sincronizando informações atualizadas dos produtos..." });
      const { error } = await supabase.functions.invoke('li-reconciliation-processor', { body: { manual: true, integrationId, syncType: 'products' } });
      if (error) throw error;
      toast({ title: "Estoque atualizado!", description: "Produtos atualizados com sucesso." });
      queryClient.invalidateQueries({ queryKey: ['li-products-all', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['li-products-count', integrationId] });
      queryClient.invalidateQueries({ queryKey: ['integration-info', integrationId] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Não foi possível atualizar as informações.";
      toast({ title: "Erro ao atualizar", description: msg, variant: "destructive" });
    } finally {
      setUpdatingStock(false);
    }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR }); } catch { return "Nunca"; }
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const clearFilters = () => {
    setShowOnlyInStock(false);
    setSelectedTypes([]);
    setIsPriceFilterActive(false);
    setIsMarginFilterActive(false);
    setPriceRange([0, maxPrice]);
    setMarginRange([0, maxMargin]);
  };

  const activeFiltersCount = (showOnlyInStock ? 1 : 0) + selectedTypes.length + (isPriceFilterActive ? 1 : 0) + (isMarginFilterActive ? 1 : 0);

  const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)));

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 5;
    if (totalPages <= showPages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= 4; i++) pages.push(i);
      pages.push('...', totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, '...');
      for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1, '...');
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push('...', totalPages);
    }
    return pages;
  };

  const handleOpenDetails = (product: Product) => {
    setSelectedProduct(product);
    setDialogOpen(true);
  };

  return {
    // Data
    integration,
    parentCount,
    totalVariationCount,
    totalProductsCount,
    filteredProducts,
    paginatedProducts,
    isLoading,
    // Sync
    syncStatus,
    handleSync,
    handleCheckNew,
    handleUpdateStock,
    cancelSync,
    checkingNew,
    updatingStock,
    // Filters
    searchQuery, setSearchQuery,
    showOnlyInStock, setShowOnlyInStock,
    selectedTypes,
    productTypes,
    toggleType,
    clearFilters,
    activeFiltersCount,
    isPriceFilterActive, setIsPriceFilterActive,
    priceRange, setPriceRange,
    isMarginFilterActive, setIsMarginFilterActive,
    marginRange, setMarginRange,
    maxPrice, maxMargin,
    sortBy, setSortBy,
    // Pagination
    currentPage, totalPages, itemsPerPage, setItemsPerPage,
    goToPage, getPageNumbers,
    // Product helpers
    getTotalStock,
    getVariationCount,
    getProductImage,
    // Dialog
    selectedProduct, dialogOpen, setDialogOpen,
    handleOpenDetails,
    // Misc
    formatLastSync,
    getMostRecentSync,
    queryClient,
  };
}
