import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Warehouse } from "lucide-react";
import { type BlingProduct, type BlingWarehouseStock, formatCurrency, formatNumber, calcularMargem } from "./blingProductHelpers";

interface Props {
  product: BlingProduct;
}

export function BlingProductPricesTab({ product }: Props) {
  const margem = calcularMargem(product);
  const estoqueDepositos = (product.estoque_depositos as BlingWarehouseStock[] | null) || null;

  return (
    <TabsContent value="precos" className="space-y-4 pr-4">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Preços
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Preço de Venda</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(product.preco)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Preço de Custo</span>
              <span className="text-lg font-medium">{formatCurrency(product.preco_custo)}</span>
            </div>
            {margem && (
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-muted-foreground">Margem de Lucro</span>
                <Badge className={Number(margem) >= 0 ? 'bg-green-500' : 'bg-red-500'}>{margem}%</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              Estoque
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Estoque Atual</span>
              <span className="text-2xl font-bold">{formatNumber(product.estoque_atual, ' un')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Estoque Mínimo</span>
              <span className="text-lg">{formatNumber(product.estoque_minimo, ' un')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Unidade</span>
              <span className="font-medium">{product.unidade || '-'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {estoqueDepositos && estoqueDepositos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estoque por Depósito</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {estoqueDepositos.map((dep, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <p className="text-sm font-medium truncate">{dep.nome}</p>
                  <p className="text-lg font-bold">{dep.saldoVirtual ?? dep.saldoFisico ?? 0} un</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}
