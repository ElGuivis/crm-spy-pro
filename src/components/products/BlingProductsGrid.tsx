import { Package, ChevronLeft, ChevronRight, ImageIcon, ImageOff, Layers, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tables } from "@/integrations/supabase/types";
import { ReactNode } from "react";

type BlingProduct = Tables<"bling_products">;

const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

interface BlingProductsGridProps {
  isLoading: boolean;
  products: BlingProduct[];
  variationData: Map<number, { count: number; stock: number }> | undefined;
  searchQuery: string;
  totalPages: number;
  currentPage: number;
  itemsPerPage: number;
  filteredTotal: number;
  setCurrentPage: (p: number) => void;
  setItemsPerPage: (n: number) => void;
  getTotalStock: (p: BlingProduct) => number;
  getProductImage: (p: BlingProduct) => string | null;
  getImageCount: (p: BlingProduct) => number;
  formatCurrency: (v: number | null) => string;
  getStockBadge: (qty: number | null) => ReactNode;
  onSelectProduct: (p: BlingProduct) => void;
}

export function BlingProductsGrid({
  isLoading, products, variationData, searchQuery,
  totalPages, currentPage, itemsPerPage, filteredTotal,
  setCurrentPage, setItemsPerPage,
  getTotalStock, getProductImage, getImageCount,
  formatCurrency, getStockBadge, onSelectProduct,
}: BlingProductsGridProps) {
  const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)));

  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, "...", totalPages];
    if (currentPage >= totalPages - 2) return [1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
      </div>
    );
  }

  if (!products.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nenhum produto encontrado</h3>
          <p className="text-muted-foreground text-center">
            {searchQuery ? "Tente ajustar sua busca." : "Os produtos sincronizados aparecerão aqui."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {products.map(product => {
          const imageCount = getImageCount(product);
          const childCount = variationData?.get(product.bling_id)?.count || 0;
          const inlineCount = (product.variacoes as Array<unknown> | null)?.length || 0;
          const totalVariationCount = childCount + inlineCount;
          const totalStock = getTotalStock(product);
          const imageUrl = getProductImage(product);

          return (
            <Card
              key={product.id}
              className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectProduct(product)}
            >
              <div className="aspect-square bg-muted flex items-center justify-center relative">
                {imageUrl ? (
                  <img src={imageUrl} alt={product.nome} className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <ImageOff className="h-10 w-10 text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground/50">Sem imagem</span>
                  </div>
                )}
                {imageCount > 1 && (
                  <div className="absolute top-2 right-2 bg-background/80 px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />{imageCount}
                  </div>
                )}
                {totalVariationCount > 0 && (
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                    <Layers className="h-3 w-3" />{totalVariationCount}
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <h3 className="font-medium text-sm line-clamp-2 mb-1">{product.nome}</h3>
                <p className="text-xs text-muted-foreground mb-2">{product.codigo || "-"}</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {product.fornecedor_nome && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      <Building2 className="h-2.5 w-2.5 mr-0.5" />Forn.
                    </Badge>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm">{formatCurrency(product.preco)}</span>
                  {getStockBadge(totalStock)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Itens por página:</span>
            <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEMS_PER_PAGE_OPTIONS.map(opt => <SelectItem key={opt} value={opt.toString()}>{opt}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {getPageNumbers().map((page, idx) => (
              <Button key={idx} variant={page === currentPage ? "default" : "outline"} size="icon"
                onClick={() => typeof page === "number" && goToPage(page)}
                disabled={typeof page !== "number"}>{page}</Button>
            ))}
            <Button variant="outline" size="icon" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">{filteredTotal} produtos</span>
        </div>
      )}
    </>
  );
}
