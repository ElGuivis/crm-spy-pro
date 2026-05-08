import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Search, Package, Loader2, ImageOff } from 'lucide-react';

import { createLogger } from '@/lib/logger';
const log = createLogger('ProductPickerDialog');

const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" fill="none"><rect width="300" height="300" fill="%23f1f5f9"/><text x="150" y="158" text-anchor="middle" fill="%2394a3b8" font-size="14" font-family="sans-serif">Sem imagem</text></svg>');

interface ProductData {
  imageUrl: string;
  name: string;
  description: string;
  price: string;
  buttonUrl: string;
}

interface ProductPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (product: ProductData) => void;
}

interface RawProduct {
  id: string;
  name: string;
  image_url?: string | null;
  price?: number | null;
  promotional_price?: number | null;
  sku?: string | null;
  source: 'loja_integrada' | 'bling';
}

export function ProductPickerDialog({ open, onOpenChange, onSelect }: ProductPickerDialogProps) {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<RawProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (open) {
      loadProducts();
    }
  }, [open]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const [liRes, blingRes] = await Promise.all([
        supabase
          .from('li_products')
          .select('id, name, image_url, price, promotional_price, sku, raw_json')
          .eq('active', true)
          .not('image_url', 'is', null)
          .order('name')
          .limit(500),
        supabase
          .from('bling_products')
          .select('id, nome, descricao_curta, imagem_url, imagens, preco, codigo, estoque_atual, produto_pai_id, bling_id')
          .order('nome')
          .limit(500),
      ]);

      // Helper: get best LI image (original full-res via caminho > grande > stored image_url)
      const getBestLiImage = (p: any): string | null => {
        const raw = p.raw_json;
        if (raw?.imagem_principal?.caminho) {
          return `https://cdn.awsli.com.br/${raw.imagem_principal.caminho}`;
        }
        if (raw?.imagem_principal?.grande) return raw.imagem_principal.grande;
        return p.image_url || null;
      };

      // Helper: get best Bling image (imagens[0].link > imagem_url)
      const getBestBlingImage = (p: any): string | null => {
        if (Array.isArray(p.imagens) && p.imagens.length > 0 && p.imagens[0]?.link) {
          return p.imagens[0].link;
        }
        return p.imagem_url || null;
      };

      // LI: show products with images (parent products)
      // In LI, parent products have images while variants have stock but no images
      // For email design, we show the parent products with their images
      const liProducts: RawProduct[] = (liRes.data || [])
        .map((p) => ({
          id: p.id,
          name: p.name,
          image_url: getBestLiImage(p),
          price: p.promotional_price || p.price,
          sku: p.sku,
          source: 'loja_integrada' as const,
        }));

      // Bling: separate parents/simple from children (variants)
      const allBling = blingRes.data || [];
      const children = allBling.filter((p) => p.produto_pai_id != null);
      const parentOrSimple = allBling.filter((p) => p.produto_pai_id == null);

      // Build set of parent IDs that have at least one child with stock
      const parentsWithChildStock = new Set<number>();
      for (const child of children) {
        if ((child.estoque_atual ?? 0) > 0 && child.produto_pai_id) {
          parentsWithChildStock.add(child.produto_pai_id);
        }
      }

      // Check if product is a parent (has children)
      const parentIds = new Set(children.map((c) => c.produto_pai_id).filter(Boolean));

      const blingProducts: RawProduct[] = parentOrSimple
        .filter((p) => {
          const bId = Number(p.bling_id ?? p.id);
          const isParent = parentIds.has(bId);
          if (isParent) {
            return parentsWithChildStock.has(bId);
          }
          return (p.estoque_atual ?? 0) > 0;
        })
        .map((p) => ({
          id: p.id,
          name: p.nome || p.descricao_curta || 'Produto sem nome',
          image_url: getBestBlingImage(p),
          price: p.preco,
          sku: p.codigo,
          source: 'bling' as const,
        }));

      setProducts([...liProducts, ...blingProducts]);
    } catch (err) {
      log.error('Error loading products:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'li' && p.source === 'loja_integrada') ||
      (activeTab === 'bling' && p.source === 'bling');
    return matchesSearch && matchesTab;
  });

  const formatPrice = (value: number | null | undefined) => {
    if (!value) return '';
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  const handleSelect = (product: RawProduct) => {
    onSelect({
      imageUrl: product.image_url || PLACEHOLDER_IMG,
      name: product.name,
      description: '',
      price: formatPrice(product.price),
      buttonUrl: '',
    });
    onOpenChange(false);
  };

  const hasLI = products.some((p) => p.source === 'loja_integrada');
  const hasBling = products.some((p) => p.source === 'bling');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Selecionar Produto da Loja
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {(hasLI || hasBling) && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                {hasLI && <TabsTrigger value="li">Loja Integrada</TabsTrigger>}
                {hasBling && <TabsTrigger value="bling">Bling</TabsTrigger>}
              </TabsList>
            </Tabs>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nenhum produto encontrado</p>
              <p className="text-sm">Conecte uma loja para importar produtos</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((product) => (
                  <button
                    key={`${product.source}-${product.id}`}
                    onClick={() => handleSelect(product)}
                    className="flex gap-3 p-3 rounded-lg border hover:border-primary hover:bg-accent/50 transition-colors text-left"
                  >
                    <img
                      src={product.image_url || PLACEHOLDER_IMG}
                      alt={product.name}
                      className="w-16 h-16 object-cover rounded flex-shrink-0 bg-muted"
                      onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG; }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{product.name}</p>
                      {product.sku && (
                        <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                      )}
                      {product.price && (
                        <p className="text-sm font-bold text-primary mt-1">
                          {formatPrice(product.price)}
                        </p>
                      )}
                      <Badge variant="outline" className="text-[10px] mt-1">
                        {product.source === 'loja_integrada' ? 'LI' : 'Bling'}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
