import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Calendar } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize-html";
import type { BlingProduct } from "./blingProductHelpers";

interface Props {
  product: BlingProduct;
}

export function BlingProductDescriptionTab({ product }: Props) {
  const hasAny = product.descricao_curta || product.descricao_completa || product.observacoes;

  return (
    <TabsContent value="descricao" className="space-y-4 pr-4">
      {product.descricao_curta && (
        <Card>
          <CardHeader><CardTitle className="text-base">Descrição Curta</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{product.descricao_curta}</p></CardContent>
        </Card>
      )}

      {product.descricao_completa && (
        <Card>
          <CardHeader><CardTitle className="text-base">Descrição Completa</CardTitle></CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.descricao_completa) }}
            />
          </CardContent>
        </Card>
      )}

      {product.observacoes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{product.observacoes}</p></CardContent>
        </Card>
      )}

      {!hasAny && (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhuma descrição cadastrada para este produto</p>
        </div>
      )}

      {product.data_validade && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4" />
              <span>Data de Validade: {new Date(product.data_validade).toLocaleDateString('pt-BR')}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}
