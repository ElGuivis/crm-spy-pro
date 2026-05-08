import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Box, Package, Tag, DollarSign, TrendingUp, Ruler, Calendar, Layers, Info, ImageIcon, Star, Ban, ExternalLink, Barcode, FileText } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { ProductImageGallery } from "./ProductImageGallery";
import { Button } from "@/components/ui/button";
import { LI_PRODUCT_SELECT } from './product-select-columns';

type Product = Tables<'li_products'>;

interface LIImage {
  grande?: string;
  media?: string;
  pequena?: string;
  pequeno?: string;
}

interface ProductDetailsDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackImage?: string | null;
}

// Helper to extract data from raw_json
const getRaw = (product: Product, key: string): any => {
  const raw = product.raw_json as any | null;
  return raw?.[key] ?? null;
};

// Extract variation attributes from name like "Camisa... Tamanho:P;Cor:Preto"
const extractVariationAttributes = (childName: string, parentName: string): Array<{ key: string; value: string }> => {
  const attrs: Array<{ key: string; value: string }> = [];
  
  // Try to find attributes after the parent name
  // Common patterns: "Parent Name Tamanho:P;Cor:Preto" or "Parent Name - Tamanho:P;Cor:Preto"
  let attrPart = childName;
  
  // Remove parent name prefix if present
  if (parentName && childName.startsWith(parentName)) {
    attrPart = childName.slice(parentName.length).trim();
    // Remove leading dash/hyphen
    attrPart = attrPart.replace(/^[-–]\s*/, '');
  }
  
  // Split by semicolon and parse key:value pairs
  const parts = attrPart.split(';');
  parts.forEach(part => {
    const colonIndex = part.indexOf(':');
    if (colonIndex > 0) {
      const key = part.slice(0, colonIndex).trim();
      const value = part.slice(colonIndex + 1).trim();
      if (key && value) {
        attrs.push({ key, value });
      }
    }
  });
  
  return attrs;
};

const ProductDetailsDialog = ({ product, open, onOpenChange, fallbackImage }: ProductDetailsDialogProps) => {
  // Fetch child products using pai URI field
  const { data: childProducts = [] } = useQuery({
    queryKey: ['li-product-children', product?.loja_integrada_product_id, product?.integration_id],
    queryFn: async () => {
      if (!product?.loja_integrada_product_id || !product?.integration_id) return [];
      
      const parentId = String(Math.round(Number(product.loja_integrada_product_id)));
      const expectedPaiUri = `/api/v1/produto/${parentId}`;
      
      // Fetch all variations for this integration and filter by pai
      const pageSize = 1000;
      let from = 0;
      const allChildren: Product[] = [];
      
      while (true) {
        const { data, error } = await supabase
          .from('li_products')
          .select(LI_PRODUCT_SELECT)
          .eq('integration_id', product.integration_id)
          .eq('active', true)
          .range(from, from + pageSize - 1)
          .returns<Product[]>();
        
        if (error) break;
        
        const matches = ((data || []) as Product[]).filter(p => {
          const paiUri = getRaw(p, 'pai');
          return paiUri === expectedPaiUri;
        });
        
        allChildren.push(...matches);
        
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      
      return allChildren;
    },
    enabled: !!product?.loja_integrada_product_id && !!product?.integration_id && open
  });

  if (!product) return null;

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateMargin = () => {
    if (!product.cost_price || !product.price) return null;
    const margin = ((product.price - product.cost_price) / product.price) * 100;
    return margin.toFixed(1);
  };

  const margin = calculateMargin();
  const rawEstoque = getRaw(product, 'estoque_quantidade');
  const stockQuantity = (typeof rawEstoque === 'number' && rawEstoque > 0) ? rawEstoque : (product.stock || 0);

  const getStockStatus = () => {
    if (stockQuantity === 0) return { label: 'Sem estoque', color: 'bg-destructive text-destructive-foreground' };
    if (stockQuantity <= 5) return { label: 'Estoque baixo', color: 'bg-yellow-500 text-white' };
    return { label: 'Em estoque', color: 'bg-green-500 text-white' };
  };

  const stockStatus = getStockStatus();

  // Parse images from raw_json
  const parseImages = (raw: unknown): LIImage[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as LIImage[];
    return [];
  };

  const rawImagens = getRaw(product, 'imagens');
  const productImages = parseImages(rawImagens);
  
  // Convert to format expected by ProductImageGallery
  const formattedImages = productImages.map(img => ({
    link: img.grande || img.media || img.pequena || img.pequeno || ''
  })).filter(img => img.link);

  // Get image for child product with inheritance from parent
  const getChildImage = (child: Product): string | null => {
    if (child.image_url) return child.image_url;
    
    const childRawImagens = getRaw(child, 'imagens');
    const childImages = parseImages(childRawImagens);
    if (childImages.length > 0) {
      const img = childImages[0];
      const url = img.grande || img.media || img.pequena || img.pequeno;
      if (url) return url;
    }
    
    // Fallback to imagem_principal
    const imgPrincipal = getRaw(child, 'imagem_principal');
    if (imgPrincipal) {
      const url = imgPrincipal?.grande || imgPrincipal?.media || imgPrincipal?.pequena;
      if (url) return url;
    }
    
    if (formattedImages.length > 0) {
      return formattedImages[0].link;
    }
    
    return product.image_url || fallbackImage || null;
  };

  // Parse attributes from raw_json
  const parseAttributes = (atributos: unknown): Array<{ nome: string; valores: string[] }> => {
    if (!atributos) return [];
    if (Array.isArray(atributos)) return atributos as Array<{ nome: string; valores: string[] }>;
    return [];
  };

  const attributes = parseAttributes(getRaw(product, 'atributos'));

  // Count variations
  const variationsJson = product.variations_json as unknown;
  const inlineVariations = Array.isArray(variationsJson) ? variationsJson : [];
  const totalVariations = childProducts.length + inlineVariations.length;

  // Dimensions from raw_json
  const peso = getRaw(product, 'peso');
  const altura = getRaw(product, 'altura');
  const largura = getRaw(product, 'largura');
  const profundidade = getRaw(product, 'profundidade');
  const hasDimensions = peso || altura || largura || profundidade;

  // Description from raw_json
  const descricaoCompleta = getRaw(product, 'descricao_completa');
  const tipo = getRaw(product, 'tipo');
  
  // Rich fields from raw_json
  const gtin = getRaw(product, 'gtin');
  const ncm = getRaw(product, 'ncm');
  const marca = getRaw(product, 'marca');
  const url = getRaw(product, 'url');
  const destaque = getRaw(product, 'destaque');
  const bloqueado = getRaw(product, 'bloqueado');
  const tags = getRaw(product, 'tags');
  const urlVideo = getRaw(product, 'url_video_youtube');

  // Extract marca name from URI if possible (e.g. /api/v1/marca/20252952)
  const marcaDisplay = typeof marca === 'string' && marca.includes('/marca/') 
    ? `Marca #${marca.split('/marca/')[1]}` 
    : marca;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <DialogTitle className="text-xl font-bold">Detalhes do Produto</DialogTitle>
            {destaque && (
              <Badge className="bg-yellow-500 text-white gap-1">
                <Star className="h-3 w-3" />
                Destaque
              </Badge>
            )}
            {bloqueado && (
              <Badge className="bg-destructive text-destructive-foreground gap-1">
                <Ban className="h-3 w-3" />
                Bloqueado
              </Badge>
            )}
            {totalVariations > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Layers className="h-3 w-3" />
                {totalVariations} {totalVariations === 1 ? 'variação' : 'variações'}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="geral" className="gap-1">
              <Info className="h-3.5 w-3.5 hidden sm:inline" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="precos" className="gap-1">
              <DollarSign className="h-3.5 w-3.5 hidden sm:inline" />
              Preços
            </TabsTrigger>
            <TabsTrigger value="dimensoes" className="gap-1">
              <Ruler className="h-3.5 w-3.5 hidden sm:inline" />
              Dimensões
            </TabsTrigger>
            <TabsTrigger value="variacoes" className="gap-1">
              <Layers className="h-3.5 w-3.5 hidden sm:inline" />
              Variações
              {totalVariations > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {totalVariations}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="descricao" className="gap-1">
              <Package className="h-3.5 w-3.5 hidden sm:inline" />
              Descrição
            </TabsTrigger>
          </TabsList>

          {/* Tab: Geral */}
          <TabsContent value="geral" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Image Gallery */}
              <div className="w-full">
                <ProductImageGallery 
                  images={formattedImages.length > 0 ? formattedImages : null}
                  fallbackUrl={product.image_url || fallbackImage}
                  productName={product.name}
                />
              </div>

              {/* Basic Info */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-lg text-foreground leading-tight">
                    {product.name}
                  </h3>
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
                    <Badge className={stockStatus.color}>
                      {stockStatus.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {stockQuantity} {stockQuantity === 1 ? 'unidade' : 'unidades'}
                    </span>
                  </div>
                </div>

                {/* Tags */}
                {tags && Array.isArray(tags) && tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Store Link */}
                {url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open(url, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver na loja
                  </Button>
                )}

                {/* Attributes */}
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
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {val}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* System Info */}
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

          {/* Tab: Preços */}
          <TabsContent value="precos" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Preço de Custo</p>
                  <p className="text-xl font-semibold">{formatCurrency(product.cost_price)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Preço de Venda</p>
                  <p className="text-xl font-semibold">{formatCurrency(product.price)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Preço Promocional</p>
                  <p className={`text-xl font-semibold ${product.promotional_price ? 'text-primary' : 'text-muted-foreground'}`}>
                    {formatCurrency(product.promotional_price)}
                  </p>
                </CardContent>
              </Card>
              {margin && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Margem
                    </p>
                    <p className={`text-xl font-semibold ${parseFloat(margin) >= 30 ? 'text-green-500' : parseFloat(margin) >= 15 ? 'text-yellow-500' : 'text-red-500'}`}>
                      {margin}%
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Tab: Dimensões */}
          <TabsContent value="dimensoes" className="mt-4">
            {hasDimensions ? (
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
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Ruler className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma dimensão cadastrada para este produto.</p>
              </div>
            )}
          </TabsContent>

          {/* Tab: Variações */}
          <TabsContent value="variacoes" className="mt-4">
            {totalVariations > 0 ? (
              <div className="space-y-6">
                {/* Child Products from Database */}
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
                            return (
                              <TableRow key={child.id}>
                                <TableCell>
                                  <div className="w-12 h-12 rounded bg-muted overflow-hidden flex-shrink-0">
                                    {getChildImage(child) ? (
                                      <img 
                                        src={getChildImage(child)!} 
                                        alt={child.name}
                                        className="w-full h-full object-cover"
                                      />
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
                                <TableCell className="font-mono text-xs">
                                  {child.sku || '-'}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  {formatCurrency(child.price)}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  {child.promotional_price ? (
                                    <span className="text-primary font-medium">{formatCurrency(child.promotional_price)}</span>
                                  ) : '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {(() => {
                                    const childRawStock = getRaw(child, 'estoque_quantidade');
                                    const childStock = (typeof childRawStock === 'number' && childRawStock > 0) ? childRawStock : (child.stock || 0);
                                    return (
                                      <Badge variant={childStock > 0 ? "default" : "secondary"}>
                                        {childStock}
                                      </Badge>
                                    );
                                  })()}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Inline Variations (from variations_json if available) */}
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
                          {inlineVariations.map((variation: any, index: number) => (
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
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Este produto não possui variações.</p>
              </div>
            )}
          </TabsContent>

          {/* Tab: Descrição */}
          <TabsContent value="descricao" className="mt-4">
            {descricaoCompleta ? (
              <Card>
                <CardContent className="pt-4">
                  <div 
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ 
                      __html: sanitizeHtml(descricaoCompleta)
                    }}
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma descrição cadastrada para este produto.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailsDialog;
