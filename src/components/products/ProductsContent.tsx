import { useState } from "react";
import { Package, Search, Filter, Eye, Tag, Box, X, AlertTriangle, ChevronLeft, ChevronRight, ArrowUpDown, ArrowLeft, RefreshCw, Zap, Clock, CheckCircle, XCircle, Layers, Star, Ban, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { SyncProgressBanner } from "@/components/common/SyncProgressBanner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ProductDetailsDialog from "@/components/products/ProductDetailsDialog";
import { ProductInlineEdit } from "@/components/products/ProductInlineEdit";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useProductsData } from "./useProductsData";
import { Product, SORT_OPTIONS, ITEMS_PER_PAGE_OPTIONS, calculateMargin, getRaw, formatCurrency, getProductStock } from "./products-helpers";

interface ProductsContentProps {
  integrationId: string;
}

export function ProductsContent({ integrationId }: ProductsContentProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const data = useProductsData(integrationId);

  const handleExportCSV = () => {
    const rows = data.filteredProducts.map((p) => [
      p.name ?? "",
      p.sku ?? "",
      p.price ?? "",
      p.promotional_price ?? "",
      p.cost_price ?? "",
      getProductStock(p),
    ]);
    const header = ["Nome", "SKU", "Preço", "Preço Promo", "Custo", "Estoque"];
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `produtos-${data.integration?.name ?? "catalogo"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStockBadge = (quantity: number | null) => {
    const qty = quantity || 0;
    if (qty === 0) return <Badge className="bg-destructive text-destructive-foreground">Sem estoque</Badge>;
    if (qty <= 5) return <Badge className="bg-yellow-500 text-white gap-1"><AlertTriangle className="h-3 w-3" />Baixo: {qty}</Badge>;
    return <Badge className="bg-green-500 text-white">{qty} un</Badge>;
  };

  return (
    <div className="space-y-6 p-6">
      <SyncProgressBanner integrationId={integrationId} entityType="products" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/products')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{data.integration?.name || 'Produtos'}</h1>
            <p className="text-muted-foreground">Gerencie os produtos desta loja</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data.filteredProducts?.length}>
            <Download className="h-4 w-4 mr-2" />CSV
          </Button>
          <SyncStatusBadge integrationId={integrationId} syncType="products" />
          <DeleteIntegrationDataButton
            integrationId={integrationId}
            dataType="produtos"
            tablesToDelete={[{ table: 'li_products' }]}
            onDeleted={() => data.queryClient.invalidateQueries({ queryKey: ['li-products-all', integrationId] })}
          />
          <Button variant="outline" onClick={data.handleUpdateStock} disabled={data.updatingStock || data.syncStatus.isActive || data.checkingNew}>
            <RefreshCw className={`h-4 w-4 mr-2 ${data.updatingStock ? 'animate-spin' : ''}`} />
            {data.updatingStock ? 'Atualizando...' : 'Atualizar Estoque'}
          </Button>
          <Button variant="outline" onClick={data.handleCheckNew} disabled={data.checkingNew || data.syncStatus.isActive || data.updatingStock}>
            <Zap className={`h-4 w-4 mr-2 ${data.checkingNew ? 'animate-pulse' : ''}`} />
            {data.checkingNew ? 'Verificando...' : 'Verificar Novos'}
          </Button>
          {data.syncStatus.isActive ? (
            <Button variant="destructive" onClick={async () => {
              try { await data.cancelSync(); toast({ title: "Sincronização cancelada" }); }
              catch { toast({ title: "Erro ao cancelar", variant: "destructive" }); }
            }}>
              <XCircle className="h-4 w-4 mr-2" />Cancelar Sync
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={data.checkingNew || data.updatingStock}>
                  {data.syncStatus.status === 'completed' ? <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> :
                   data.syncStatus.status === 'failed' ? <XCircle className="h-4 w-4 mr-2 text-red-500" /> :
                   <RefreshCw className="h-4 w-4 mr-2" />}
                  {data.syncStatus.status === 'completed' ? 'Concluído!' : 'Sincronizar'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={data.handleSync}>
                  <RefreshCw className="h-4 w-4 mr-2" />Sincronização Incremental
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  toast({ title: "Sincronização completa iniciada", description: "Importando todos os produtos da loja..." });
                  await supabase.functions.invoke('li-sync', { body: { integrationId, syncType: 'products' } });
                }}>
                  <Zap className="h-4 w-4 mr-2" />Sincronização Completa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Sync Progress */}
      {data.syncStatus.isActive && data.syncStatus.progress.total > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Sincronizando produtos...</span>
                <span>{data.syncStatus.progress.saved} de {data.syncStatus.progress.total}</span>
              </div>
              <Progress value={(data.syncStatus.progress.saved / data.syncStatus.progress.total) * 100} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Produtos (pai + simples)</p><p className="text-2xl font-bold">{data.parentCount}</p></div><Package className="h-8 w-8 text-primary opacity-50" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Variações</p><p className="text-2xl font-bold">{data.totalVariationCount}</p></div><Layers className="h-8 w-8 text-muted-foreground opacity-50" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Última Sincronização</p><p className="text-sm font-medium">{data.formatLastSync(data.getMostRecentSync(data.integration as any | null) ?? null)}</p></div><Clock className="h-8 w-8 text-muted-foreground opacity-50" /></div></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={data.searchQuery}
            onChange={(e) => data.setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />Filtros
              {data.activeFiltersCount > 0 && <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">{data.activeFiltersCount}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 bg-popover border border-border" align="end">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-foreground">Filtros Avançados</h4>
                {data.activeFiltersCount > 0 && <Button variant="ghost" size="sm" onClick={data.clearFilters} className="h-auto p-1 text-xs text-muted-foreground"><X className="h-3 w-3 mr-1" />Limpar</Button>}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Estoque</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox id="in-stock" checked={data.showOnlyInStock} onCheckedChange={(checked) => data.setShowOnlyInStock(checked === true)} />
                  <label htmlFor="in-stock" className="text-sm text-muted-foreground cursor-pointer">Apenas com estoque</label>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Faixa de Preço</Label>
                  <Checkbox id="price-filter-active" checked={data.isPriceFilterActive} onCheckedChange={(checked) => data.setIsPriceFilterActive(checked === true)} />
                </div>
                <div className={data.isPriceFilterActive ? "" : "opacity-50 pointer-events-none"}>
                  <Slider value={data.priceRange} onValueChange={(value) => data.setPriceRange(value as [number, number])} max={data.maxPrice} min={0} step={10} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>{formatCurrency(data.priceRange[0])}</span><span>{formatCurrency(data.priceRange[1])}</span></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Margem de Lucro (%)</Label>
                  <Checkbox id="margin-filter-active" checked={data.isMarginFilterActive} onCheckedChange={(checked) => data.setIsMarginFilterActive(checked === true)} />
                </div>
                <div className={data.isMarginFilterActive ? "" : "opacity-50 pointer-events-none"}>
                  <Slider value={data.marginRange} onValueChange={(value) => data.setMarginRange(value as [number, number])} max={data.maxMargin} min={0} step={5} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>{data.marginRange[0]}%</span><span>{data.marginRange[1]}%</span></div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipos de Produto</Label>
                <div className="max-h-32 overflow-y-auto space-y-2 pr-2">
                  {data.productTypes.map(type => (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox id={`type-${type}`} checked={data.selectedTypes.includes(type)} onCheckedChange={() => data.toggleType(type)} />
                      <label htmlFor={`type-${type}`} className="text-sm text-muted-foreground cursor-pointer">{type}</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Select value={data.sortBy} onValueChange={(value) => data.setSortBy(value as typeof data.sortBy)}>
          <SelectTrigger className="w-40"><ArrowUpDown className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>{SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>

        <Select value={data.itemsPerPage.toString()} onValueChange={(value) => data.setItemsPerPage(Number(value))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{ITEMS_PER_PAGE_OPTIONS.map(n => <SelectItem key={n} value={n.toString()}>{n} por pág</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Products Grid */}
      {data.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: data.itemsPerPage }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-card p-4">
              <Skeleton className="aspect-square rounded-lg mb-3" /><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : data.paginatedProducts.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhum produto encontrado</p>
          {!data.filteredProducts?.length && (
            <Button variant="outline" className="mt-4" onClick={data.handleSync} disabled={data.syncStatus.isActive}>Sincronizar Produtos</Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {data.paginatedProducts.map((product) => {
            const imageUrl = data.getProductImage(product);
            const margin = calculateMargin(product);
            const totalStock = data.getTotalStock(product);
            const variationCount = data.getVariationCount(product);
            const isDestaque = getRaw(product, 'destaque') === true;
            const isBloqueado = getRaw(product, 'bloqueado') === true;

            return (
              <div key={product.id} className="rounded-xl border border-border/50 bg-card overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => data.handleOpenDetails(product)}>
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {imageUrl ? <img src={imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <div className="w-full h-full flex items-center justify-center"><Box className="h-12 w-12 text-muted-foreground/30" /></div>}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {isDestaque && <Badge className="bg-yellow-500 text-white gap-1 text-xs px-1.5"><Star className="h-3 w-3" />Destaque</Badge>}
                    {isBloqueado && <Badge className="bg-destructive text-destructive-foreground gap-1 text-xs px-1.5"><Ban className="h-3 w-3" />Bloqueado</Badge>}
                  </div>
                  <div className="absolute top-2 right-2">{getStockBadge(totalStock)}</div>
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <h3 className="font-medium text-sm text-card-foreground line-clamp-2 flex-1">{product.name}</h3>
                    {variationCount > 0 && <Badge variant="secondary" className="gap-0.5 flex-shrink-0 text-xs px-1.5"><Layers className="h-3 w-3" />{variationCount}</Badge>}
                  </div>
                  {product.sku && <p className="text-xs text-muted-foreground font-mono mb-2 truncate">{product.sku}</p>}
                  <div className="flex items-center justify-between">
                    <div>
                      {product.promotional_price && product.price && product.promotional_price < product.price ? (
                        <><p className="text-xs text-muted-foreground line-through">{formatCurrency(product.price)}</p><p className="font-bold text-green-600">{formatCurrency(product.promotional_price)}</p></>
                      ) : (
                        <p className="font-bold text-card-foreground">{formatCurrency(product.price)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {margin !== null && <Badge variant="outline" className={margin >= 30 ? 'text-green-600 border-green-600' : margin >= 15 ? 'text-yellow-600 border-yellow-600' : 'text-red-600 border-red-600'}>{margin.toFixed(0)}%</Badge>}
                      <ProductInlineEdit product={product} integrationId={integrationId} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Mostrando {((data.currentPage - 1) * data.itemsPerPage) + 1} a {Math.min(data.currentPage * data.itemsPerPage, data.filteredProducts.length)} de {data.filteredProducts.length} produtos
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => data.goToPage(data.currentPage - 1)} disabled={data.currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex items-center gap-1 mx-2">
              {data.getPageNumbers().map((page, index) => typeof page === 'number' ? (
                <Button key={index} variant={data.currentPage === page ? "default" : "outline"} size="sm" onClick={() => data.goToPage(page)} className="w-8 h-8 p-0">{page}</Button>
              ) : (
                <span key={index} className="px-2 text-muted-foreground">...</span>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => data.goToPage(data.currentPage + 1)} disabled={data.currentPage === data.totalPages}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <ProductDetailsDialog product={data.selectedProduct} open={data.dialogOpen} onOpenChange={data.setDialogOpen} />
    </div>
  );
}
