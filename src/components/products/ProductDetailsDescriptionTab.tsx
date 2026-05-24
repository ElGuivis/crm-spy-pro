import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { type Product, getRaw } from "./productDetailsHelpers";

interface Props {
  product: Product;
}

export function ProductDetailsDescriptionTab({ product }: Props) {
  const descricaoCompleta = getRaw(product, 'descricao_completa');

  if (!descricaoCompleta) {
    return (
      <TabsContent value="descricao" className="mt-4">
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhuma descrição cadastrada para este produto.</p>
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="descricao" className="mt-4">
      <Card>
        <CardContent className="pt-4">
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(descricaoCompleta) }}
          />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
