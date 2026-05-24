import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Ruler } from "lucide-react";
import { type Product, getRaw } from "./productDetailsHelpers";

interface Props {
  product: Product;
}

export function ProductDetailsDimensionsTab({ product }: Props) {
  const peso = getRaw(product, 'peso');
  const altura = getRaw(product, 'altura');
  const largura = getRaw(product, 'largura');
  const profundidade = getRaw(product, 'profundidade');
  const hasDimensions = peso || altura || largura || profundidade;

  if (!hasDimensions) {
    return (
      <TabsContent value="dimensoes" className="mt-4">
        <div className="text-center py-8 text-muted-foreground">
          <Ruler className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhuma dimensão cadastrada para este produto.</p>
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="dimensoes" className="mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {peso !== null && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Peso</p>
              <p className="text-xl font-semibold">{peso} kg</p>
            </CardContent>
          </Card>
        )}
        {altura !== null && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Altura</p>
              <p className="text-xl font-semibold">{altura} cm</p>
            </CardContent>
          </Card>
        )}
        {largura !== null && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Largura</p>
              <p className="text-xl font-semibold">{largura} cm</p>
            </CardContent>
          </Card>
        )}
        {profundidade !== null && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Profundidade</p>
              <p className="text-xl font-semibold">{profundidade} cm</p>
            </CardContent>
          </Card>
        )}
      </div>
    </TabsContent>
  );
}
