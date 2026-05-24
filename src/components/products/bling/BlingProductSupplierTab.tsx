import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { InfoItem } from "./InfoItem";
import type { BlingProduct } from "./blingProductHelpers";

interface Props {
  product: BlingProduct;
}

export function BlingProductSupplierTab({ product }: Props) {
  return (
    <TabsContent value="fornecedor" className="space-y-4 pr-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Dados do Fornecedor
          </CardTitle>
        </CardHeader>
        <CardContent>
          {product.fornecedor_nome ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome do Fornecedor" value={product.fornecedor_nome} />
                <InfoItem label="Código no Fornecedor" value={product.fornecedor_codigo || '-'} />
              </div>
              {product.fornecedor_id && (
                <p className="text-xs text-muted-foreground">
                  ID do Fornecedor no Bling: {product.fornecedor_id}
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum fornecedor cadastrado para este produto</p>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
