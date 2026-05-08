import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Package } from "lucide-react";

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface TopProductsCardProps {
  products: TopProduct[];
  isLoading?: boolean;
  period?: 'month' | '30d';
}

export function TopProductsCard({ products, isLoading, period = 'month' }: TopProductsCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">🏆 Produtos Mais Vendidos {period === '30d' ? '(30 dias)' : ''}</CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma venda encontrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((product, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.quantity} vendidos</p>
                </div>
                <div className="text-sm font-semibold text-green-600">
                  {formatCurrency(product.revenue)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
