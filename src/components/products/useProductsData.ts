import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { Product, SortOption } from "./products-helpers";
import { useProductsQueries } from "./useProductsQueries";
import {
  splitParentsAndVariations,
  totalStockOf,
  variationCountOf,
  buildImageMap,
  productImageOf,
  collectProductTypes,
  computeMaxima,
  filterAndSortProducts,
  buildPageNumbers,
  getMostRecentSync,
  formatLastSync,
} from "./products-derived";

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

  const { integration, totalProductsCount, allProducts, isLoading } = useProductsQueries(integrationId, syncStatus.status);

  const { parentProducts, variationDataMap, parentCount, variationCount: totalVariationCount } = useMemo(
    () => splitParentsAndVariations(allProducts),
    [allProducts],
  );

  const getTotalStock = (product: Product): number => totalStockOf(product, variationDataMap);
  const getVariationCount = (product: Product): number => variationCountOf(product, variationDataMap);

  const imageMap = useMemo(() => buildImageMap(parentProducts), [parentProducts]);
  const getProductImage = (product: Product) => productImageOf(product, imageMap);
  const productTypes = useMemo(() => collectProductTypes(parentProducts), [parentProducts]);
  const { maxPrice, maxMargin } = useMemo(() => computeMaxima(parentProducts), [parentProducts]);

  const filteredProducts = useMemo(
    () => filterAndSortProducts(
      parentProducts,
      { searchQuery, showOnlyInStock, selectedTypes, isPriceFilterActive, priceRange, isMarginFilterActive, marginRange, sortBy },
      getTotalStock,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTotalStock depende só de variationDataMap
    [parentProducts, searchQuery, showOnlyInStock, selectedTypes, isPriceFilterActive, priceRange, isMarginFilterActive, marginRange, sortBy, variationDataMap],
  );

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, showOnlyInStock, selectedTypes, isPriceFilterActive, priceRange, isMarginFilterActive, marginRange, sortBy, variationDataMap]);

  const invalidateProductQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['li-products-all', integrationId] });
    queryClient.invalidateQueries({ queryKey: ['li-products-count', integrationId] });
    queryClient.invalidateQueries({ queryKey: ['integration-info', integrationId] });
  };

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
      invalidateProductQueries();
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
      invalidateProductQueries();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Não foi possível atualizar as informações.";
      toast({ title: "Erro ao atualizar", description: msg, variant: "destructive" });
    } finally {
      setUpdatingStock(false);
    }
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
  const getPageNumbers = () => buildPageNumbers(currentPage, totalPages);

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
