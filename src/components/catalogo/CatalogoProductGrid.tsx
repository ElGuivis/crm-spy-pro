import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, ImageOff } from "lucide-react";
import { type CatalogProduct, formatCatalogCurrency } from "./catalogoHelpers";

interface Props {
  isLoading: boolean;
  products: CatalogProduct[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

export function CatalogoProductGrid({ isLoading, products, selectedIds, onToggleSelect }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-lg" />)}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Package className="h-12 w-12 mb-4" />
        <p className="text-lg font-medium">Nenhum produto encontrado</p>
        <p className="text-sm">Ajuste os filtros ou sincronize produtos na página de Produtos.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
                    <ImageOff className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <Checkbox checked={selected} className="bg-background" />
                </div>
                <Badge className="absolute top-2 right-2 bg-green-600 text-white text-xs">{product.stock} un</Badge>
              </div>
              <div className="p-3 space-y-1">
                <p className="text-sm font-medium line-clamp-2 leading-tight">{product.name}</p>
                <p className="text-base font-bold text-primary">{formatCatalogCurrency(product.price)}</p>
                {product.variations.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.variations.slice(0, 3).map((v, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] px-1 py-0">{v}</Badge>
                    ))}
                    {product.variations.length > 3 && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">+{product.variations.length - 3}</Badge>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
