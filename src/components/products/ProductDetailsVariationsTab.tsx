import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers, Package, ImageIcon } from "lucide-react";
import {
  type Product, getRaw, formatCurrency, extractVariationAttributes,
  getProductImages, getChildImage, getStockQuantity,
} from "./productDetailsHelpers";

interface Props {
  product: Product;
  childProducts: Product[];
  fallbackImage?: string | null;
}

export function ProductDetailsVariationsTab({ product, childProducts, fallbackImage }: Props) {
  const variationsJson = product.variations_json as unknown;
  const inlineVariations = Array.isArray(variationsJson) ? variationsJson : [];
  const totalVariations = childProducts.length + inlineVariations.length;
  const parentFormattedImages = getProductImages(product);

  if (totalVariations === 0) {
    return (
      <TabsContent value="variacoes" className="mt-4">
        <div className="text-center py-8 text-muted-foreground">
          <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Este produto não possui variações.</p>
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="variacoes" className="mt-4">
      <div className="space-y-6">
        {childProducts.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Variações ({childProducts.length})
            </h4>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Imagem</TableHead>
                    <TableHead>Atributos</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Promo</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {childProducts.map((child) => {
                    const attrs = extractVariationAttributes(child.name, product.name);
                    const childImg = getChildImage(child, product, parentFormattedImages, fallbackImage);
                    const childRawStock = getRaw(child, 'estoque_quantidade');
                    const childStock = (typeof childRawStock === 'number' && childRawStock > 0) ? childRawStock : (child.stock || 0);
                    return (
                      <TableRow key={child.id}>
                        <TableCell>
                          <div className="w-12 h-12 rounded bg-muted overflow-hidden flex-shrink-0">
                            {childImg ? (
                              <img src={childImg} alt={child.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {attrs.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {attrs.map((attr, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {attr.key}: {attr.value}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground truncate block max-w-[200px]">
                              {child.name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{child.sku || '-'}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(child.price)}</TableCell>
                        <TableCell className="text-right text-sm">
                          {child.promotional_price ? (
                            <span className="text-primary font-medium">{formatCurrency(child.promotional_price)}</span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={childStock > 0 ? "default" : "secondary"}>{childStock}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {inlineVariations.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Variações Inline ({inlineVariations.length})
            </h4>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variação</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inlineVariations.map((variation, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {variation.nome || variation.sku || `Variação ${index + 1}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(variation.preco || variation.preco_cheio)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={variation.estoque > 0 ? "default" : "secondary"}>
                          {variation.estoque || 0}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </TabsContent>
  );
}

export function getVariationCount(product: Product, childProducts: Product[]): number {
  const variationsJson = product.variations_json as unknown;
  const inlineVariations = Array.isArray(variationsJson) ? variationsJson : [];
  return childProducts.length + inlineVariations.length;
}
