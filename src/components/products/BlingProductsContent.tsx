import { useState, useEffect } from "react";
import { ArrowLeft, RefreshCw, Download, XCircle, PackageSearch, RotateCw, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CatalogFilterRow } from "@/components/catalogo/CatalogFilterRow";
import { Label } from "@/components/ui/label";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
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
    filters, setFilter, resetFilters, filterOptions, currentPage, setCurrentPage, itemsPerPage, setItemsPerPage,
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

  useEffect(() => { setCurrentPage(1); }, [filters, setCurrentPage]);
  const anyFilter = !!(filters.search || filters.type || filters.color || filters.size || filters.onlyInStock);

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

      {/* Filtros: os mesmos do Catálogo WhatsApp */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <CatalogFilterRow filters={filters} setFilter={setFilter} options={filterOptions} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <Switch id="bling-stock" checked={filters.onlyInStock} onCheckedChange={(v) => setFilter("onlyInStock", v)} />
              <Label htmlFor="bling-stock" className="text-sm">Só com estoque</Label>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {anyFilter && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs px-2">
                  <X className="h-3 w-3 mr-1" />Limpar filtros
                </Button>
              )}
              <Badge variant="secondary" className="text-xs">{filteredProducts.length} produto{filteredProducts.length === 1 ? "" : "s"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <BlingProductsGrid
        isLoading={isLoading} products={paginatedProducts} variationData={variationData}
        searchQuery={filters.search} totalPages={totalPages} currentPage={currentPage}
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
