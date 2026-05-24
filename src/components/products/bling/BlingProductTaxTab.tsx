import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { InfoItem } from "./InfoItem";
import { type BlingProduct, getOrigemLabel } from "./blingProductHelpers";

interface Props {
  product: BlingProduct;
}

export function BlingProductTaxTab({ product }: Props) {
  return (
    <TabsContent value="tributacao" className="space-y-4 pr-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Dados Fiscais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoItem label="NCM" value={product.ncm || '-'} />
            <InfoItem label="CEST" value={product.cest || '-'} />
            <InfoItem label="Origem" value={getOrigemLabel(product.origem)} />
            <InfoItem label="Classe Fiscal" value={product.classe_fiscal || '-'} />
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
