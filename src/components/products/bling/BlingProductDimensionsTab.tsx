import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ruler, Scale, Truck } from "lucide-react";
import { InfoItem } from "./InfoItem";
import { type BlingProduct, formatNumber } from "./blingProductHelpers";

interface Props {
  product: BlingProduct;
}

export function BlingProductDimensionsTab({ product }: Props) {
  return (
    <TabsContent value="dimensoes" className="space-y-4 pr-4">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Dimensões
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Altura</p>
                <p className="font-bold">{formatNumber(product.altura, ' cm')}</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Largura</p>
                <p className="font-bold">{formatNumber(product.largura, ' cm')}</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Profundidade</p>
                <p className="font-bold">{formatNumber(product.profundidade, ' cm')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Peso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Peso Líquido</p>
                <p className="font-bold">{formatNumber(product.peso_liquido, ' kg')}</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Peso Bruto</p>
                <p className="font-bold">{formatNumber(product.peso_bruto, ' kg')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Envio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem label="Volumes por Produto" value={formatNumber(product.volumes_por_produto)} />
            <InfoItem label="Cross-Docking" value={formatNumber(product.cross_docking, ' dias')} />
            <InfoItem label="Garantia" value={formatNumber(product.garantia, ' meses')} />
            <InfoItem label="GTIN Embalagem" value={product.gtin_embalagem || '-'} />
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
