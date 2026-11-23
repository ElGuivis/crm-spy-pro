import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { Product } from "./products-helpers";
import { useLiProductFilters } from "./useLiProductFilters";
import { useProductsQueries } from "./useProductsQueries";
import {
  splitParentsAndVariations,
  totalStockOf,
  variationCountOf,
  buildImageMap,
  productImageOf,
  buildPageNumbers,
  getMostRecentSync,
  formatLastSync,
} from "./products-derived";

export function useProductsData(integrationId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { syncStatus, startSync, cancelSync } = useSyncStatus(integrationId, 'products');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkingNew, setCheckingNew] = useState(false);
  const [updatingStock, setUpdatingStock] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);

  const [showInactive, setShowInactive] = useState(false);
  const { integration, totalProductsCount, allProducts, isLoading, inactiveCount } = useProductsQueries(integrationId, syncStatus.status, showInactive);

  const { parentProducts, variationDataMap, parentCount, variationCount: totalVariationCount } = useMemo(
    () => splitParentsAndVariations(allProducts),
    [allProducts],
  );

  const getTotalStock = (product: Product): number => totalStockOf(product, variationDataMap);
  const getVariationCount = (product: Product): number => variationCountOf(product, variationDataMap);

  const imageMap = useMemo(() => buildImageMap(parentProducts), [parentProducts]);
  const getProductImage = (product: Product) => productImageOf(product, imageMap);
  const { filters, setFilter, resetFilters, filterOptions, filteredProducts, anyFilter } =
    useLiProductFilters(integrationId, parentProducts, getTotalStock);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [filters]);

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
    showInactive,
    setShowInactive,
    inactiveCount,
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
    filters, setFilter, resetFilters, filterOptions, anyFilter,
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
