import { useState, useMemo } from "react";
import { ArrowLeft, Search, Package, Send, Check, ImageOff, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTokens } from "@/contexts/TokenContext";
import { useToast } from "@/hooks/use-toast";
import { SendCatalogDialog } from "./SendCatalogDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CatalogoContentProps {
  integrationId: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  price: number | null;
  stock: number;
  imageUrl: string | null;
  sku: string | null;
  variations: string[];
  /** Parsed structured attributes e.g. { Tamanho: "M", Cor: "Preto" } */
  parsedAttributes: Record<string, string[]>;
  source: 'li' | 'bling';
}

/** Parse variation strings like "Tamanho:M;Cor:Preto" into { Tamanho: ["M"], Cor: ["Preto"] } */
function parseVariationAttributes(variations: string[]): Record<string, string[]> {
  const attrs: Record<string, string[]> = {};
  for (const v of variations) {
    const parts = v.split(';');
    for (const part of parts) {
      const [key, val] = part.split(':').map(s => s.trim());
      if (key && val) {
        if (!attrs[key]) attrs[key] = [];
        if (!attrs[key].includes(val)) attrs[key].push(val);
      }
    }
  }
  return attrs;
}

export function CatalogoContent({ integrationId }: CatalogoContentProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId } = useAuth();
  const { balance } = useTokens();

  const [searchQuery, setSearchQuery] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [colorFilter, setColorFilter] = useState<string>("");
  const [sizeFilter, setSizeFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Detect integration type
  const { data: integration } = useQuery({
    queryKey: ['catalogo-integration', integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integrations')
        .select('name, type')
        .eq('id', integrationId)
        .maybeSingle();
      return data;
    },
  });

  const isBling = integration?.type === 'bling';

  // Fetch LI products (all active — parents + children)
  const { data: liProducts, isLoading: liLoading } = useQuery({
    queryKey: ['catalogo-li-products', integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('li_products')
        .select('id, name, price, promotional_price, stock, image_url, sku, variations_json, raw_json, loja_integrada_product_id')
        .eq('integration_id', integrationId)
        .eq('active', true);
      return data || [];
    },
    enabled: !!integrationId && !isBling,
  });

  // Fetch Bling products
  const { data: blingProducts, isLoading: blingLoading } = useQuery({
    queryKey: ['catalogo-bling-products', integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bling_products')
        .select('id, nome, preco, estoque_atual, imagem_url, imagens, codigo, variacoes')
        .eq('integration_id', integrationId)
        .is('produto_pai_id', null);
      return data || [];
    },
    enabled: !!integrationId && isBling === true,
  });

  // Normalize products to unified format
  const products: CatalogProduct[] = useMemo(() => {
    if (isBling && blingProducts) {
      return blingProducts.map(p => {
        const imagens = p.imagens as Array<{ link: string }> | null;
        const variacoes = p.variacoes as Array<{ nome?: string; estoque?: { saldoVirtualTotal?: number } }> | null;
        const variationNames = variacoes?.map(v => v.nome || '').filter(Boolean) || [];
        const inlineStock = variacoes?.reduce((sum, v) => sum + (v.estoque?.saldoVirtualTotal || 0), 0) || 0;

        return {
          id: p.id,
          name: p.nome,
          price: p.preco,
          stock: (p.estoque_atual || 0) + inlineStock,
          imageUrl: (imagens && imagens[0]?.link) || p.imagem_url || null,
          sku: p.codigo,
          variations: variationNames,
          parsedAttributes: parseVariationAttributes(variationNames),
          source: 'bling' as const,
        };
      });
    }

    if (!isBling && liProducts) {
      // Separate parents and children
      const parents = liProducts.filter(p => {
        const tipo = (p.raw_json as any)?.tipo;
        return tipo === 'atributo' || tipo === 'simples' || !tipo;
      });
      const children = liProducts.filter(p => {
        const tipo = (p.raw_json as any)?.tipo;
        return tipo === 'atributo_opcao';
      });

      // Build parent ID -> children map using pai URL (e.g. "/api/v1/produto/12345")
      const childrenByParentLiId = new Map<number, typeof children>();
      for (const child of children) {
        const paiUrl = (child.raw_json as any)?.pai as string | null;
        if (paiUrl) {
          const match = paiUrl.match(/\/produto\/(\d+)$/);
          if (match) {
            const parentLiId = parseInt(match[1], 10);
            if (!childrenByParentLiId.has(parentLiId)) childrenByParentLiId.set(parentLiId, []);
            childrenByParentLiId.get(parentLiId)!.push(child);
          }
        }
      }

      // Set of child IDs that are aggregated into a parent
      const aggregatedChildIds = new Set<string>();

      const parentProducts: CatalogProduct[] = parents.map(p => {
        const raw = p.raw_json as any | null;
        const liId = p.loja_integrada_product_id;
        const myChildren = liId ? (childrenByParentLiId.get(liId) || []) : [];
        
        // Mark children as aggregated
        myChildren.forEach(c => aggregatedChildIds.add(c.id));

        // Aggregate stock from children, fallback to own stock
        const childrenStock = myChildren.reduce((sum, c) => {
          const cRaw = c.raw_json as any | null;
          const cStock = cRaw?.estoque_quantidade;
          return sum + (typeof cStock === 'number' ? Math.max(cStock, 0) : Math.max(c.stock || 0, 0));
        }, 0);
        const ownStock = typeof raw?.estoque_quantidade === 'number' ? Math.max(raw.estoque_quantidade, 0) : Math.max(p.stock || 0, 0);
        const totalStock = myChildren.length > 0 ? childrenStock : ownStock;

        // Extract variation names from children
        const variationNames: string[] = [];
        for (const child of myChildren) {
          const cRaw = child.raw_json as any | null;
          const cStock = cRaw?.estoque_quantidade;
          if (typeof cStock === 'number' && cStock > 0) {
            // Parse variation from child name (e.g. "Product Tamanho:M;Cor:Preto")
            const childName = child.name || '';
            const parentName = p.name || '';
            const suffix = childName.replace(parentName, '').trim();
            if (suffix) variationNames.push(suffix);
          }
        }

        // Get image from parent — build original quality URL from caminho (no resize)
        const imagemPrincipal = raw?.imagem_principal;
        const caminho = imagemPrincipal?.caminho;
        const imgUrl = caminho ? `https://cdn.awsli.com.br/${caminho}` : imagemPrincipal?.grande || p.image_url || null;

        return {
          id: p.id,
          name: p.name,
          price: (p.promotional_price as number) || p.price,
          stock: totalStock,
          imageUrl: imgUrl,
          sku: p.sku,
          variations: variationNames,
          parsedAttributes: parseVariationAttributes(variationNames),
          source: 'li' as const,
        };
      });

      // Also include standalone children (no parent found) that have images
      const standaloneChildren: CatalogProduct[] = children
        .filter(c => !aggregatedChildIds.has(c.id))
        .map(p => {
          const raw = p.raw_json as any | null;
          const rawStock = raw?.estoque_quantidade;
          const stock = typeof rawStock === 'number' ? Math.max(rawStock, 0) : Math.max(p.stock || 0, 0);
          const imagemPrincipal = raw?.imagem_principal;
          const caminho = imagemPrincipal?.caminho;
          const imgUrl = caminho ? `https://cdn.awsli.com.br/${caminho}` : imagemPrincipal?.grande || p.image_url || null;

          return {
            id: p.id,
            name: p.name,
            price: (p.promotional_price as number) || p.price,
            stock,
            imageUrl: imgUrl,
            sku: p.sku,
            variations: [],
            parsedAttributes: {},
            source: 'li' as const,
          };
        });

      return [...parentProducts, ...standaloneChildren];
    }

    return [];
  }, [isBling, liProducts, blingProducts]);

  // Extract unique attribute values for structured filters
  // Extract product type from first word of name
  const getProductType = (name: string): string => {
    const firstWord = name.trim().split(/\s+/)[0];
    return firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase() : '';
  };

  const filterOptions = useMemo(() => {
    const colorKeys = ['Cor', 'cor', 'Color', 'color'];
    const sizeKeys = ['Tamanho', 'tamanho', 'Size', 'size'];
    const colors = new Set<string>();
    const sizes = new Set<string>();
    const productTypes = new Set<string>();

    products.forEach(p => {
      for (const [key, vals] of Object.entries(p.parsedAttributes)) {
        if (colorKeys.includes(key)) vals.forEach(v => colors.add(v));
        else if (sizeKeys.includes(key)) vals.forEach(v => sizes.add(v));
      }
      const type = getProductType(p.name);
      if (type) productTypes.add(type);
    });

    return {
      colors: Array.from(colors).sort(),
      sizes: Array.from(sizes).sort(),
      productTypes: Array.from(productTypes).sort(),
    };
  }, [products]);

  // Filter products
  const filtered = useMemo(() => {
    const colorKeys = ['Cor', 'cor', 'Color', 'color'];
    const sizeKeys = ['Tamanho', 'tamanho', 'Size', 'size'];

    return products.filter(p => {
      if (onlyInStock && p.stock <= 0) return false;
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !(p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))) return false;
      if (!p.imageUrl) return false;

      // Color filter
      if (colorFilter && colorFilter !== 'all') {
        const productColors = Object.entries(p.parsedAttributes)
          .filter(([k]) => colorKeys.includes(k))
          .flatMap(([, v]) => v);
        if (!productColors.includes(colorFilter)) return false;
      }

      // Size filter
      if (sizeFilter && sizeFilter !== 'all') {
        const productSizes = Object.entries(p.parsedAttributes)
          .filter(([k]) => sizeKeys.includes(k))
          .flatMap(([, v]) => v);
        if (!productSizes.includes(sizeFilter)) return false;
      }

      // Product type filter (first word of name)
      if (categoryFilter && categoryFilter !== 'all') {
        const type = getProductType(p.name);
        if (type !== categoryFilter) return false;
      }

      return true;
    });
  }, [products, onlyInStock, searchQuery, colorFilter, sizeFilter, categoryFilter]);

  const isLoading = liLoading || blingLoading;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const selectedProducts = filtered.filter(p => selectedIds.has(p.id));
  const tokenCost = selectedProducts.length;

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/catalogo-whatsapp')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Catálogo WhatsApp</h1>
            <p className="text-muted-foreground">{integration?.name} — Selecione produtos para enviar via WhatsApp</p>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <Button onClick={() => {
            if (balance < tokenCost) {
              toast({ title: "Tokens insuficientes", description: `Você precisa de ${tokenCost} tokens. Saldo: ${balance}.`, variant: "destructive" });
              return;
            }
            setShowSendDialog(true);
          }} className="gap-2">
            <Send className="h-4 w-4" />
            Enviar {selectedIds.size} produto{selectedIds.size > 1 ? 's' : ''} ({tokenCost} token{tokenCost > 1 ? 's' : ''})
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou SKU..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {filterOptions.colors.length > 0 && (
              <Select value={colorFilter} onValueChange={setColorFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Cor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as cores</SelectItem>
                  {filterOptions.colors.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {filterOptions.sizes.length > 0 && (
              <Select value={sizeFilter} onValueChange={setSizeFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Tamanho" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tamanhos</SelectItem>
                  {filterOptions.sizes.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {filterOptions.productTypes.length > 1 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tipo de produto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {filterOptions.productTypes.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex items-center gap-2">
              <Switch id="stock-filter" checked={onlyInStock} onCheckedChange={setOnlyInStock} />
              <Label htmlFor="stock-filter" className="text-sm">Somente com estoque</Label>
            </div>

            <Button variant="outline" size="sm" onClick={selectAll}>
              <Check className="h-4 w-4 mr-1" />
              {selectedIds.size === filtered.length && filtered.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}
            </Button>

            <Badge variant="secondary">{filtered.length} produtos</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">Nenhum produto encontrado</p>
          <p className="text-sm">Ajuste os filtros ou sincronize produtos na página de Produtos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(product => {
            const selected = selectedIds.has(product.id);
            return (
              <Card
                key={product.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
                onClick={() => toggleSelect(product.id)}
              >
                <CardContent className="p-0">
                  <div className="relative aspect-square bg-muted rounded-t-lg overflow-hidden">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <Checkbox checked={selected} className="bg-background" />
                    </div>
                    <Badge className="absolute top-2 right-2 bg-green-600 text-white text-xs">
                      {product.stock} un
                    </Badge>
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-medium line-clamp-2 leading-tight">{product.name}</p>
                    <p className="text-base font-bold text-primary">{formatCurrency(product.price)}</p>
                    {product.variations.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {product.variations.slice(0, 3).map((v, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1 py-0">{v}</Badge>
                        ))}
                        {product.variations.length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">+{product.variations.length - 3}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Send Dialog */}
      <SendCatalogDialog
        open={showSendDialog}
        onOpenChange={setShowSendDialog}
        products={selectedProducts}
        integrationId={integrationId}
        onSuccess={() => {
          setSelectedIds(new Set());
          setShowSendDialog(false);
        }}
      />
    </div>
  );
}
