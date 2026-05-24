import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers, ImageIcon, Info } from "lucide-react";
import {
  type BlingProduct, type BlingInlineVariation,
  formatCurrency, parseImages,
} from "./blingProductHelpers";

interface Props {
  product: BlingProduct;
  childProducts: BlingProduct[];
}

export function BlingProductVariationsTab({ product, childProducts }: Props) {
  const images = parseImages(product.imagens);
  const variacoes = (product.variacoes as BlingInlineVariation[] | null) || null;
  const noVariations = (!variacoes || variacoes.length === 0) && (!childProducts || childProducts.length === 0);

  return (
    <TabsContent value="variacoes" className="space-y-4 pr-4">
      {childProducts && childProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Variações do Produto ({childProducts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Variação</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {childProducts.map((child) => {
                  const childImages = parseImages(child.imagens);
                  const childImageUrl = childImages?.[0]?.link || child.imagem_url || images?.[0]?.link || product.imagem_url;
                  return (
                    <TableRow key={child.id}>
                      <TableCell>
                        {childImageUrl ? (
                          <img src={childImageUrl} alt={child.nome} className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell><p className="font-medium">{child.nome}</p></TableCell>
                      <TableCell className="text-muted-foreground">{child.codigo || '-'}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(child.preco)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={child.estoque_atual && child.estoque_atual > 0 ? 'default' : 'destructive'}>
                          {child.estoque_atual || 0} un
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {variacoes && variacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Variações Inline ({variacoes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {variacoes.map((variacao, i) => (
                <div key={i} className="p-3 border rounded-lg flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {variacao.imagemURL ? (
                      <img src={variacao.imagemURL} alt={variacao.nome} className="w-10 h-10 object-cover rounded" />
                    ) : null}
                    <div>
                      <p className="font-medium">{variacao.nome}</p>
                      {variacao.codigo && (
                        <p className="text-xs text-muted-foreground">Código: {variacao.codigo}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {variacao.preco && <p className="font-bold">{formatCurrency(variacao.preco)}</p>}
                    {variacao.estoque?.saldoVirtualTotal !== undefined && (
                      <p className="text-sm text-muted-foreground">Estoque: {variacao.estoque.saldoVirtualTotal}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {noVariations && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Este produto não possui variações</p>
            </div>
          </CardContent>
        </Card>
      )}

      {product.produto_pai_id && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>Este é uma variação do produto ID: {product.produto_pai_id}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}

export function countBlingVariations(product: BlingProduct, childProducts: BlingProduct[]): number {
  const variacoes = (product.variacoes as BlingInlineVariation[] | null) || [];
  return variacoes.length + (childProducts?.length || 0);
}
