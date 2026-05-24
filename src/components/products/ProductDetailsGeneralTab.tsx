import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tag, Package, Barcode, FileText, Calendar, ExternalLink } from "lucide-react";
import { ProductImageGallery } from "./ProductImageGallery";
import {
  type Product, getRaw, formatDate, parseAttributes,
  getProductImages, getStockQuantity, getStockStatus,
} from "./productDetailsHelpers";

interface Props {
  product: Product;
  fallbackImage?: string | null;
}

export function ProductDetailsGeneralTab({ product, fallbackImage }: Props) {
  const formattedImages = getProductImages(product);
  const stockQuantity = getStockQuantity(product);
  const stockStatus = getStockStatus(stockQuantity);
  const attributes = parseAttributes(getRaw(product, 'atributos'));

  const tipo = getRaw(product, 'tipo');
  const gtin = getRaw(product, 'gtin');
  const ncm = getRaw(product, 'ncm');
  const marca = getRaw(product, 'marca');
  const url = getRaw(product, 'url');
  const tags = getRaw(product, 'tags');

  const marcaDisplay = typeof marca === 'string' && marca.includes('/marca/')
    ? `Marca #${marca.split('/marca/')[1]}`
    : marca;

  return (
    <TabsContent value="geral" className="space-y-6 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="w-full">
          <ProductImageGallery
            images={formattedImages.length > 0 ? formattedImages : null}
            fallbackUrl={product.image_url || fallbackImage}
            productName={product.name}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-lg text-foreground leading-tight">{product.name}</h3>
            <Badge variant={product.active ? "default" : "secondary"}>
              {product.active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>

          <div className="space-y-2">
            {product.sku && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Tag className="h-4 w-4" />
                <span>SKU: <span className="font-mono">{product.sku}</span></span>
              </div>
            )}

            {tipo && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" />
                <span>Tipo: {tipo === 'atributo' ? 'Produto com variações' : tipo === 'normal' ? 'Produto simples' : tipo}</span>
              </div>
            )}

            {gtin && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Barcode className="h-4 w-4" />
                <span>GTIN/EAN: <span className="font-mono">{gtin}</span></span>
              </div>
            )}

            {ncm && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>NCM: <span className="font-mono">{ncm}</span></span>
              </div>
            )}

            {marcaDisplay && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Tag className="h-4 w-4" />
                <span>Marca: {marcaDisplay}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Badge className={stockStatus.color}>{stockStatus.label}</Badge>
              <span className="text-sm text-muted-foreground">
                {stockQuantity} {stockQuantity === 1 ? 'unidade' : 'unidades'}
              </span>
            </div>
          </div>

          {tags && Array.isArray(tags) && tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag: string, idx: number) => (
                <Badge key={idx} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}

          {url && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(url, '_blank')}>
              <ExternalLink className="h-4 w-4" />
              Ver na loja
            </Button>
          )}

          {attributes.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Atributos</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-2">
                  {attributes.map((attr, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{attr.nome}:</span>
                      <div className="flex flex-wrap gap-1">
                        {attr.valores?.map((val, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">{val}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Informações do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Atualizado (remoto)</span>
                  <span>{formatDate(product.updated_at_remote)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sincronizado em</span>
                  <span>{formatDate(product.updated_at_local)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID Loja Integrada</span>
                  <span className="font-mono text-xs">{product.loja_integrada_product_id}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </TabsContent>
  );
}
