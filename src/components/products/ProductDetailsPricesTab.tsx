import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { type Product, formatCurrency, calculateMargin } from "./productDetailsHelpers";

interface Props {
  product: Product;
}

export function ProductDetailsPricesTab({ product }: Props) {
  const margin = calculateMargin(product);

  return (
    <TabsContent value="precos" className="mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Preço de Custo</p>
            <p className="text-xl font-semibold">{formatCurrency(product.cost_price)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Preço de Venda</p>
            <p className="text-xl font-semibold">{formatCurrency(product.price)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Preço Promocional</p>
            <p className={`text-xl font-semibold ${product.promotional_price ? 'text-primary' : 'text-muted-foreground'}`}>
              {formatCurrency(product.promotional_price)}
            </p>
          </CardContent>
        </Card>
        {margin && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Margem
              </p>
              <p className={`text-xl font-semibold ${parseFloat(margin) >= 30 ? 'text-green-500' : parseFloat(margin) >= 15 ? 'text-yellow-500' : 'text-red-500'}`}>
                {margin}%
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TabsContent>
  );
}
