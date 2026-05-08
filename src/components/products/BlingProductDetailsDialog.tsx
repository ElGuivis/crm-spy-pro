import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Package, DollarSign, Ruler, Truck, Building2, FileText, 
  Layers, Tag, Box, Scale, Warehouse, Calendar, Info, ImageIcon
} from "lucide-react";
import { ProductImageGallery } from "./ProductImageGallery";
import { Tables } from "@/integrations/supabase/types";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize-html";

import { createLogger } from '@/lib/logger';
import { BLING_PRODUCT_SELECT } from './product-select-columns';
const log = createLogger('BlingProductDetailsDialog');

type BlingProduct = Tables<'bling_products'>;

interface BlingProductDetailsDialogProps {
  product: BlingProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BlingProductDetailsDialog({ product, open, onOpenChange }: BlingProductDetailsDialogProps) {
  // Fetch child products (variations stored as separate products in the database)
  const { data: childProducts } = useQuery({
    queryKey: ['bling-product-children', product?.bling_id, product?.integration_id],
    queryFn: async () => {
      if (!product?.bling_id || !product?.integration_id) return [];
      const { data, error } = await supabase
        .from('bling_products')
        .select(BLING_PRODUCT_SELECT)
        .eq('integration_id', product.integration_id)
        .eq('produto_pai_id', product.bling_id)
        .order('nome', { ascending: true })
        .returns<BlingProduct[]>();
      
      if (error) {
        log.error('Error fetching child products:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!product?.bling_id && !!product?.integration_id && open
  });

  if (!product) return null;

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatNumber = (value: number | null | undefined, suffix?: string) => {
    if (value === null || value === undefined) return '-';
    return `${value}${suffix || ''}`;
  };

  const getCondicaoLabel = (condicao: number | null) => {
    switch (condicao) {
      case 1: return 'Novo';
      case 2: return 'Usado';
      default: return 'Não especificado';
    }
  };

  const getOrigemLabel = (origem: number | null) => {
    switch (origem) {
      case 0: return 'Nacional';
      case 1: return 'Estrangeira (importação direta)';
      case 2: return 'Estrangeira (adquirida no mercado interno)';
      default: return origem?.toString() || '-';
    }
  };

  // Parse images from JSONB
  const images = product.imagens as Array<{ link: string; tipo?: string }> | null;
  
  // Parse inline variations (from product's variacoes JSONB)
  const variacoes = product.variacoes as Array<{
    id: number;
    nome: string;
    codigo?: string;
    preco?: number;
    estoque?: { saldoVirtualTotal?: number };
    imagemURL?: string;
  }> | null;

  // Parse stock by warehouse
  const estoqueDepositos = product.estoque_depositos as Array<{
    id: number;
    nome: string;
    saldoVirtual?: number;
    saldoFisico?: number;
  }> | null;

  // Calculate total variations (inline + child products)
  const totalVariations = (variacoes?.length || 0) + (childProducts?.length || 0);

  // Profit margin calculation
  const calcularMargem = () => {
    if (!product.preco || !product.preco_custo || product.preco_custo === 0) return null;
    const margem = ((product.preco - product.preco_custo) / product.preco_custo) * 100;
    return margem.toFixed(1);
  };

  const margem = calcularMargem();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {product.nome}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="geral" className="h-full">
          <TabsList className="grid grid-cols-4 lg:grid-cols-7 w-full">
            <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
            <TabsTrigger value="precos" className="text-xs">Preços</TabsTrigger>
            <TabsTrigger value="dimensoes" className="text-xs">Dimensões</TabsTrigger>
            <TabsTrigger value="fornecedor" className="text-xs">Fornecedor</TabsTrigger>
            <TabsTrigger value="tributacao" className="text-xs">Tributação</TabsTrigger>
            <TabsTrigger value="variacoes" className="text-xs">Variações</TabsTrigger>
            <TabsTrigger value="descricao" className="text-xs">Descrição</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh] mt-4">
            {/* GERAL */}
            <TabsContent value="geral" className="space-y-4 pr-4">
              <div className="grid md:grid-cols-2 gap-6">
                <ProductImageGallery 
                  images={images}
                  fallbackUrl={product.imagem_url}
                  productName={product.nome}
                />

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem icon={Tag} label="Código" value={product.codigo || '-'} />
                    <InfoItem icon={Tag} label="SKU/GTIN" value={product.gtin || product.ean || '-'} />
                    <InfoItem icon={Box} label="Tipo" value={product.tipo || '-'} />
                    <InfoItem icon={Layers} label="Formato" value={product.formato || '-'} />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      <Badge variant={product.situacao === 'A' ? 'default' : 'secondary'}>
                        {product.situacao === 'A' ? 'Ativo' : product.situacao === 'I' ? 'Inativo' : product.situacao}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Condição:</span>
                      <Badge variant="outline">{getCondicaoLabel(product.condicao)}</Badge>
                    </div>

                    {product.marca && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Marca:</span>
                        <span className="font-medium">{product.marca}</span>
                      </div>
                    )}

                    {product.categoria_nome && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Categoria:</span>
                        <span className="font-medium">{product.categoria_nome}</span>
                      </div>
                    )}

                    {product.localizacao && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Localização:</span>
                        <span className="font-medium">{product.localizacao}</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="flex flex-wrap gap-2">
                    {product.frete_gratis && <Badge className="bg-green-500">Frete Grátis</Badge>}
                    {product.producao_propria && <Badge variant="outline">Produção Própria</Badge>}
                    {product.sob_encomenda && <Badge variant="outline">Sob Encomenda</Badge>}
                    {totalVariations > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <Layers className="h-3 w-3" />
                        {totalVariations} Variações
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* PREÇOS E ESTOQUE */}
            <TabsContent value="precos" className="space-y-4 pr-4">
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Preços
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Preço de Venda</span>
                      <span className="text-2xl font-bold text-primary">
                        {formatCurrency(product.preco)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Preço de Custo</span>
                      <span className="text-lg font-medium">
                        {formatCurrency(product.preco_custo)}
                      </span>
                    </div>
                    {margem && (
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-muted-foreground">Margem de Lucro</span>
                        <Badge className={Number(margem) >= 0 ? 'bg-green-500' : 'bg-red-500'}>
                          {margem}%
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Warehouse className="h-4 w-4" />
                      Estoque
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Estoque Atual</span>
                      <span className="text-2xl font-bold">
                        {formatNumber(product.estoque_atual, ' un')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Estoque Mínimo</span>
                      <span className="text-lg">
                        {formatNumber(product.estoque_minimo, ' un')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Unidade</span>
                      <span className="font-medium">{product.unidade || '-'}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Stock by warehouse */}
              {estoqueDepositos && estoqueDepositos.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Estoque por Depósito</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {estoqueDepositos.map((dep, i) => (
                        <div key={i} className="p-3 border rounded-lg">
                          <p className="text-sm font-medium truncate">{dep.nome}</p>
                          <p className="text-lg font-bold">{dep.saldoVirtual ?? dep.saldoFisico ?? 0} un</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* DIMENSÕES E ENVIO */}
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

            {/* FORNECEDOR */}
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

            {/* TRIBUTAÇÃO */}
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

            {/* VARIAÇÕES */}
            <TabsContent value="variacoes" className="space-y-4 pr-4">
              {/* Child products from database */}
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
                          const childImages = child.imagens as Array<{ link: string }> | null;
                          const childImageUrl = childImages?.[0]?.link || child.imagem_url || images?.[0]?.link || product.imagem_url;
                          
                          return (
                            <TableRow key={child.id}>
                              <TableCell>
                                {childImageUrl ? (
                                  <img 
                                    src={childImageUrl} 
                                    alt={child.nome}
                                    className="w-10 h-10 object-cover rounded"
                                  />
                                ) : (
                                  <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <p className="font-medium">{child.nome}</p>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {child.codigo || '-'}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(child.preco)}
                              </TableCell>
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

              {/* Inline variations from JSONB */}
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
                              <img 
                                src={variacao.imagemURL} 
                                alt={variacao.nome}
                                className="w-10 h-10 object-cover rounded"
                              />
                            ) : null}
                            <div>
                              <p className="font-medium">{variacao.nome}</p>
                              {variacao.codigo && (
                                <p className="text-xs text-muted-foreground">Código: {variacao.codigo}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            {variacao.preco && (
                              <p className="font-bold">{formatCurrency(variacao.preco)}</p>
                            )}
                            {variacao.estoque?.saldoVirtualTotal !== undefined && (
                              <p className="text-sm text-muted-foreground">
                                Estoque: {variacao.estoque.saldoVirtualTotal}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No variations message */}
              {(!variacoes || variacoes.length === 0) && (!childProducts || childProducts.length === 0) && (
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

            {/* DESCRIÇÃO */}
            <TabsContent value="descricao" className="space-y-4 pr-4">
              {product.descricao_curta && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Descrição Curta</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{product.descricao_curta}</p>
                  </CardContent>
                </Card>
              )}

              {product.descricao_completa && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Descrição Completa</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ 
                        __html: sanitizeHtml(product.descricao_completa) 
                      }}
                    />
                  </CardContent>
                </Card>
              )}

              {product.observacoes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Observações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{product.observacoes}</p>
                  </CardContent>
                </Card>
              )}

              {!product.descricao_curta && !product.descricao_completa && !product.observacoes && (
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
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Helper component for info items
function InfoItem({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon?: React.ComponentType<{ className?: string }>; 
  label: string; 
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="font-medium text-sm truncate" title={value}>{value}</p>
    </div>
  );
}
