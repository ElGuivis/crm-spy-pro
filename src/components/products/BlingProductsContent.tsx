import { useState, useEffect } from "react";
import { Search, ArrowLeft, RefreshCw, ArrowUpDown, Download, XCircle, PackageSearch, RotateCw, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { useBlingSync } from "@/hooks/useBlingSync";
import { BlingProductDetailsDialog } from "./BlingProductDetailsDialog";
import { useBlingProductsData } from "@/hooks/useBlingProductsData";
import { BlingProductSyncProgress } from "./BlingProductSyncProgress";
import { BlingProductsGrid } from "./BlingProductsGrid";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Tables } from "@/integrations/supabase/types";

type BlingProduct = Tables<"bling_products">;

const SORT_OPTIONS = [
  { value: "name_asc", label: "Nome (A-Z)" },
  { value: "name_desc", label: "Nome (Z-A)" },
  { value: "price_asc", label: "Preço (menor)" },
  { value: "price_desc", label: "Preço (maior)" },
  { value: "stock_asc", label: "Estoque (menor)" },
  { value: "stock_desc", label: "Estoque (maior)" },
] as const;

interface BlingProductsContentProps {
  integrationId: string;
}

export function BlingProductsContent({ integrationId }: BlingProductsContentProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState<BlingProduct | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { syncStatus, currentJob, startSync, cancelSync, resumeSync, checkForNew, updateStock, isStuck, lastHeartbeatAgo } = useBlingSync(integrationId, "products");
  const { syncStatus: enrichmentStatus, currentJob: enrichmentJob } = useBlingSync(integrationId, "product_enrichment");

  const {
    integration, products, variationData, isLoading, refetchProducts,
    searchQuery, setSearchQuery, showOnlyInStock, setShowOnlyInStock,
    sortBy, setSortBy, currentPage, setCurrentPage, itemsPerPage, setItemsPerPage,
    isExporting, handleExportCSV, filteredProducts, paginatedProducts, totalPages,
    getTotalStock, getProductImage, getImageCount, formatLastSync, formatCurrency, getStockBadge,
  } = useBlingProductsData(integrationId);

  useEffect(() => {
    const channel = supabase
      .channel(`bling-products-${integrationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bling_products", filter: `integration_id=eq.${integrationId}` },
        () => refetchProducts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [integrationId, refetchProducts]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, showOnlyInStock, sortBy, variationData]);

  const isSyncing = syncStatus === "syncing" || syncStatus === "pending";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{integration?.name || "Produtos Bling"}</h1>
            <p className="text-muted-foreground">Produtos sincronizados do Bling</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {isSyncing ? (
            <Button variant="destructive" onClick={cancelSync}>
              <XCircle className="h-4 w-4 mr-2" />Cancelar Sync
            </Button>
          ) : (
            <>
              <Button onClick={() => startSync()}>
                <RefreshCw className="h-4 w-4 mr-2" />Sincronizar Produtos
              </Button>
              <Button variant="outline" onClick={updateStock} title="Atualiza o estoque dos produtos existentes">
                <PackageSearch className="h-4 w-4 mr-2" />Atualizar Estoque
              </Button>
            </>
          )}
          <Button variant="outline" onClick={handleExportCSV} disabled={isExporting || !products?.length}>
            <Download className={`h-4 w-4 mr-2 ${isExporting ? "animate-pulse" : ""}`} />
            {isExporting ? "Exportando..." : "Exportar CSV"}
          </Button>
          <DeleteIntegrationDataButton
            integrationId={integrationId} dataType="produtos"
            tablesToDelete={[{ table: "bling_products" }]}
            onDeleted={() => queryClient.invalidateQueries({ queryKey: ["bling-products", integrationId] })}
          />
          <Button variant="outline" onClick={() => refetchProducts()}>
            <RefreshCw className="h-4 w-4 mr-2" />Atualizar
          </Button>
        </div>
      </div>

      <BlingProductSyncProgress
        syncStatus={syncStatus} enrichmentStatus={enrichmentStatus}
        currentJob={currentJob} enrichmentJob={enrichmentJob}
        isStuck={isStuck} lastHeartbeatAgo={lastHeartbeatAgo} resumeSync={resumeSync}
      />

      {/* Auto-Sync Status */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <SyncStatusBadge integrationId={integrationId} syncType="products" />
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={checkForNew} disabled={isSyncing}>
                <PackageSearch className="h-4 w-4 mr-2" />Buscar Novos
              </Button>
              <Button variant="outline" size="sm" onClick={updateStock} disabled={isSyncing}>
                <RotateCw className="h-4 w-4 mr-2" />Atualizar Estoque
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total de Produtos", value: products?.length || 0 },
          { label: "Em Estoque", value: products?.filter(p => getTotalStock(p) > 0).length || 0 },
          { label: "Sem Estoque", value: products?.filter(p => getTotalStock(p) === 0).length || 0 },
          { label: "Com Imagens", value: products?.filter(p => getImageCount(p) > 0).length || 0, icon: true },
          { label: "Última Sync", value: formatLastSync(integration?.last_sync_products_at || null), small: true },
        ].map(({ label, value, icon, small }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className={`font-bold flex items-center gap-2 ${small ? "text-sm" : "text-2xl"}`}>
                {value}{icon && <ImageIcon className="h-4 w-4 text-muted-foreground" />}
              </div>
              <p className="text-sm text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por nome ou código..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-md bg-background" />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="inStock" checked={showOnlyInStock}
            onCheckedChange={v => setShowOnlyInStock(v as boolean)} />
          <Label htmlFor="inStock" className="text-sm cursor-pointer">Apenas em estoque</Label>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <ArrowUpDown className="h-4 w-4 mr-2" />Ordenar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48">
            <div className="space-y-2">
              {SORT_OPTIONS.map(o => (
                <Button key={o.value} variant={sortBy === o.value ? "secondary" : "ghost"}
                  size="sm" className="w-full justify-start" onClick={() => setSortBy(o.value as typeof sortBy)}>
                  {o.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <BlingProductsGrid
        isLoading={isLoading} products={paginatedProducts} variationData={variationData}
        searchQuery={searchQuery} totalPages={totalPages} currentPage={currentPage}
        itemsPerPage={itemsPerPage} filteredTotal={filteredProducts.length}
        setCurrentPage={setCurrentPage} setItemsPerPage={setItemsPerPage}
        getTotalStock={getTotalStock} getProductImage={getProductImage}
        getImageCount={getImageCount} formatCurrency={formatCurrency}
        getStockBadge={getStockBadge} onSelectProduct={p => { setSelectedProduct(p); setDialogOpen(true); }}
      />

      <BlingProductDetailsDialog product={selectedProduct} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
