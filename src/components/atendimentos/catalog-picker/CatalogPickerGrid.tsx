import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, ImageOff, Images } from "lucide-react";
import { type CatalogProduct, formatCatalogCurrency, MAX_CATALOG_PHOTOS } from "@/components/catalogo/catalogoHelpers";

interface Props {
  isLoading: boolean;
  products: CatalogProduct[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  /** abre a escolha de fotos do produto (só aparece nos selecionados com mais de uma foto) */
  onEditPhotos?: (p: CatalogProduct) => void;
  photoCount?: (p: CatalogProduct) => number;
}

export function CatalogPickerGrid({ isLoading, products, selectedIds, onToggleSelect, onEditPhotos, photoCount }: Props) {
  return (
    <ScrollArea className="flex-1 px-4">
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mb-3" />
          <p className="text-sm">Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-4">
          {products.map(product => {
            const selected = selectedIds.has(product.id);
            return (
              <Card
                key={product.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selected ? "ring-2 ring-primary bg-primary/5" : ""}`}
                onClick={() => onToggleSelect(product.id)}
              >
                <CardContent className="p-0">
                  <div className="relative aspect-square bg-muted rounded-t-lg overflow-hidden">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute top-1.5 left-1.5">
                      <Checkbox checked={selected} className="bg-background h-4 w-4" />
                    </div>
                    <Badge className="absolute top-1.5 right-1.5 bg-green-600 text-white text-[10px] px-1 py-0">{product.stock}</Badge>
                  </div>
                  <div className="p-2 space-y-0.5">
                    <p className="text-xs font-medium line-clamp-2 leading-tight">{product.name}</p>
                    <p className="text-sm font-bold text-primary">{formatCatalogCurrency(product.price)}</p>
                {selected && product.images.length > 1 && onEditPhotos && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onEditPhotos(product); }} className="mt-1 inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs font-medium text-primary hover:bg-muted">
                    <Images className="h-3 w-3" />Fotos {photoCount?.(product) ?? 1}/{MAX_CATALOG_PHOTOS}
                  </button>
                )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </ScrollArea>
  );
}
