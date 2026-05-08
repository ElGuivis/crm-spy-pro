import { useState, useMemo } from "react";
import { Search, Package, Send, Check, ImageOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTokens } from "@/contexts/TokenContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CatalogPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  contactPhone: string;
  conversationId: string;
  onSendNote: (content: string) => void;
}

interface CatalogProduct {
  id: string;
  name: string;
  price: number | null;
  stock: number;
  imageUrl: string | null;
  sku: string | null;
  variations: string[];
  parsedAttributes: Record<string, string[]>;
  source: 'li' | 'bling';
}

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

const getProductType = (name: string): string => {
  const firstWord = name.trim().split(/\s+/)[0];
  return firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase() : '';
};

export function CatalogPickerDialog({ open, onOpenChange, integrationId, contactPhone, conversationId, onSendNote }: CatalogPickerDialogProps) {
  const { tenantId } = useAuth();
  const { balance, refetchBalance } = useTokens();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [colorFilter, setColorFilter] = useState<string>("");
  const [sizeFilter, setSizeFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [includePrice, setIncludePrice] = useState(true);

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
    enabled: open && !!integrationId,
  });

  const isBling = integration?.type === 'bling';

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
    enabled: open && !!integrationId && !isBling,
  });

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
    enabled: open && !!integrationId && isBling === true,
  });

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
      const parents = liProducts.filter(p => {
        const tipo = (p.raw_json as any)?.tipo;
        return tipo === 'atributo' || tipo === 'simples' || !tipo;
      });
      const children = liProducts.filter(p => {
        const tipo = (p.raw_json as any)?.tipo;
        return tipo === 'atributo_opcao';
      });
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
      const aggregatedChildIds = new Set<string>();
      const parentProducts: CatalogProduct[] = parents.map(p => {
        const raw = p.raw_json as any | null;
        const liId = p.loja_integrada_product_id;
        const myChildren = liId ? (childrenByParentLiId.get(liId) || []) : [];
        myChildren.forEach(c => aggregatedChildIds.add(c.id));
        const childrenStock = myChildren.reduce((sum, c) => {
          const cRaw = c.raw_json as any | null;
          const cStock = cRaw?.estoque_quantidade;
          return sum + (typeof cStock === 'number' ? Math.max(cStock, 0) : Math.max(c.stock || 0, 0));
        }, 0);
        const ownStock = typeof raw?.estoque_quantidade === 'number' ? Math.max(raw.estoque_quantidade, 0) : Math.max(p.stock || 0, 0);
        const totalStock = myChildren.length > 0 ? childrenStock : ownStock;
        const variationNames: string[] = [];
        for (const child of myChildren) {
          const cRaw = child.raw_json as any | null;
          const cStock = cRaw?.estoque_quantidade;
          if (typeof cStock === 'number' && cStock > 0) {
            const childName = child.name || '';
            const parentName = p.name || '';
            const suffix = childName.replace(parentName, '').trim();
            if (suffix) variationNames.push(suffix);
          }
        }
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

  const filtered = useMemo(() => {
    const colorKeys = ['Cor', 'cor', 'Color', 'color'];
    const sizeKeys = ['Tamanho', 'tamanho', 'Size', 'size'];
    return products.filter(p => {
      if (onlyInStock && p.stock <= 0) return false;
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !(p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))) return false;
      if (!p.imageUrl) return false;
      if (colorFilter && colorFilter !== 'all') {
        const productColors = Object.entries(p.parsedAttributes).filter(([k]) => colorKeys.includes(k)).flatMap(([, v]) => v);
        if (!productColors.includes(colorFilter)) return false;
      }
      if (sizeFilter && sizeFilter !== 'all') {
        const productSizes = Object.entries(p.parsedAttributes).filter(([k]) => sizeKeys.includes(k)).flatMap(([, v]) => v);
        if (!productSizes.includes(sizeFilter)) return false;
      }
      if (categoryFilter && categoryFilter !== 'all') {
        if (getProductType(p.name) !== categoryFilter) return false;
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
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.id)));
  };

  const selectedProducts = filtered.filter(p => selectedIds.has(p.id));
  const tokenCost = selectedProducts.length;

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleSend = async () => {
    if (!tenantId || selectedProducts.length === 0) return;
    if (balance < tokenCost) {
      toast({ title: "Tokens insuficientes", description: `Você precisa de ${tokenCost} tokens. Saldo: ${balance}.`, variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send-catalog', {
        body: {
          tenant_id: tenantId,
          integration_id: integrationId,
          phone: contactPhone,
          include_price: includePrice,
          include_stock: false,
          send_as_document: false,
          products: selectedProducts.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            stock: p.stock,
            image_url: p.imageUrl,
            variations: p.variations,
            source: p.source,
          })),
        },
      });
      if (error) throw error;
      const result = data as { sent: number; failed: number; token_cost: number };
      toast({
        title: "Catálogo enviado!",
        description: `${result.sent} produto${result.sent > 1 ? 's' : ''} enviado${result.sent > 1 ? 's' : ''}. ${result.token_cost} token${result.token_cost > 1 ? 's' : ''} consumido${result.token_cost > 1 ? 's' : ''}.`,
      });
      // Send internal note listing sent products
      const productList = selectedProducts.map(p => `• ${p.name}${p.price ? ` — R$ ${p.price.toFixed(2).replace('.', ',')}` : ''}`).join('\n');
      onSendNote(`📦 Catálogo enviado (${result.sent} produto${result.sent > 1 ? 's' : ''}):\n${productList}`);
      await refetchBalance();
      setSelectedIds(new Set());
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Erro ao enviar", description: error.message || "Não foi possível enviar.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Catálogo de Produtos
          </DialogTitle>
          <DialogDescription>
            {integration?.name || 'Loja'} — Selecione produtos para enviar ao cliente
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="px-4 pb-2 shrink-0 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            {filterOptions.productTypes.length > 1 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.productTypes.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {filterOptions.colors.length > 0 && (
              <Select value={colorFilter} onValueChange={setColorFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Cor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filterOptions.colors.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {filterOptions.sizes.length > 0 && (
              <Select value={sizeFilter} onValueChange={setSizeFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Tamanho" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.sizes.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1.5">
              <Switch id="stock-picker" checked={onlyInStock} onCheckedChange={setOnlyInStock} className="scale-75" />
              <Label htmlFor="stock-picker" className="text-xs">Estoque</Label>
            </div>
            <Button variant="outline" size="sm" onClick={selectAll} className="h-7 text-xs px-2">
              <Check className="h-3 w-3 mr-1" />
              {selectedIds.size === filtered.length && filtered.length > 0 ? 'Desmarcar' : 'Todos'}
            </Button>
            <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
          </div>

          {/* Send options row */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Switch id="price-picker" checked={includePrice} onCheckedChange={setIncludePrice} className="scale-75" />
              <Label htmlFor="price-picker" className="text-xs">Preço</Label>
            </div>
          </div>
        </div>

        {/* Product grid */}
        <ScrollArea className="flex-1 px-4">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mb-3" />
              <p className="text-sm">Nenhum produto encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-4">
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
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageOff className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute top-1.5 left-1.5">
                          <Checkbox checked={selected} className="bg-background h-4 w-4" />
                        </div>
                        <Badge className="absolute top-1.5 right-1.5 bg-green-600 text-white text-[10px] px-1 py-0">
                          {product.stock}
                        </Badge>
                      </div>
                      <div className="p-2 space-y-0.5">
                        <p className="text-xs font-medium line-clamp-2 leading-tight">{product.name}</p>
                        <p className="text-sm font-bold text-primary">{formatCurrency(product.price)}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer with send button */}
        {selectedIds.size > 0 && (
          <div className="border-t px-4 py-3 flex items-center justify-between bg-card shrink-0">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} produto{selectedIds.size > 1 ? 's' : ''} · {tokenCost} token{tokenCost > 1 ? 's' : ''}
            </span>
            <Button onClick={handleSend} disabled={sending} className="gap-2" size="sm">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Enviando...' : 'Enviar'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
