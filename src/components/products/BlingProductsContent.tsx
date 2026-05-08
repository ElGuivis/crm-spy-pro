import { useState, useMemo, useEffect } from "react";
import { Package, Search, ArrowLeft, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, ArrowUpDown, Download, XCircle, Building2, Layers, ImageIcon, Loader2, ImageOff, Sparkles, Clock, PackageSearch, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tables } from "@/integrations/supabase/types";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useBlingSync } from "@/hooks/useBlingSync";
import { BlingProductDetailsDialog } from "./BlingProductDetailsDialog";
import { Progress } from "@/components/ui/progress";
import { BLING_PRODUCT_SELECT } from './product-select-columns';

type BlingProduct = Tables<'bling_products'>;

const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name_asc', label: 'Nome (A-Z)' },
  { value: 'name_desc', label: 'Nome (Z-A)' },
  { value: 'price_asc', label: 'Preço (menor)' },
  { value: 'price_desc', label: 'Preço (maior)' },
  { value: 'stock_asc', label: 'Estoque (menor)' },
  { value: 'stock_desc', label: 'Estoque (maior)' },
];

interface BlingProductsContentProps {
  integrationId: string;
}

export function BlingProductsContent({ integrationId }: BlingProductsContentProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<BlingProduct | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [isExporting, setIsExporting] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // Bling sync hooks for products and enrichment
  const { syncStatus, currentJob, startSync, cancelSync, resumeSync, checkForNew, updateStock, isStuck, lastHeartbeatAgo } = useBlingSync(integrationId, 'products');
  const { syncStatus: enrichmentStatus, currentJob: enrichmentJob } = useBlingSync(integrationId, 'product_enrichment');

  const { data: integration, refetch: refetchIntegration } = useQuery({
    queryKey: ['integration-info', integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integrations')
        .select('name, last_sync_products_at, auto_sync_products, auto_sync_products_interval')
        .eq('id', integrationId)
        .single();
      return data as { 
        name: string; 
        last_sync_products_at: string | null;
        auto_sync_products: boolean;
        auto_sync_products_interval: number;
      } | null;
    }
  });

  const { data: products, isLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['bling-products', integrationId],
    queryFn: async () => {
      // Only show parent products:
      // - formato = 'V' (products with inline variations)
      // - OR formato = 'S' without variation pattern in name (simple products, not variations)
      // Variations are identified by patterns like "Tamanho:X" or "Cor:Y" in their names
      const { data, error } = await supabase
        .from('bling_products')
        .select(BLING_PRODUCT_SELECT)
        .eq('integration_id', integrationId)
        .is('produto_pai_id', null)
        .or('formato.eq.V,and(formato.eq.S,nome.not.ilike.%Tamanho:%,nome.not.ilike.%;%)')
        .order('nome', { ascending: true })
        .returns<BlingProduct[]>();
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch variation data (count and stock) for parent products
  const { data: variationData } = useQuery({
    queryKey: ['bling-variation-data', integrationId],
    queryFn: async () => {
      // Get all child products with their stock
      const { data, error } = await supabase
        .from('bling_products')
        .select('produto_pai_id, estoque_atual')
        .eq('integration_id', integrationId)
        .not('produto_pai_id', 'is', null);
      
      if (error) throw error;
      
      // Group by produto_pai_id: count and total stock
      const dataMap = new Map<number, { count: number; stock: number }>();
      data?.forEach(p => {
        if (p.produto_pai_id) {
          const current = dataMap.get(p.produto_pai_id) || { count: 0, stock: 0 };
          dataMap.set(p.produto_pai_id, {
            count: current.count + 1,
            stock: current.stock + (p.estoque_atual || 0)
          });
        }
      });
      return dataMap;
    },
    enabled: !!integrationId
  });

  // Helper to get inline variation stock from JSONB
  const getInlineVariationStock = (product: BlingProduct): number => {
    const variacoes = product.variacoes as Array<{
      estoque?: { saldoVirtualTotal?: number };
    }> | null;
    
    if (!variacoes || variacoes.length === 0) return 0;
    
    return variacoes.reduce((sum, v) => {
      return sum + (v.estoque?.saldoVirtualTotal || 0);
    }, 0);
  };

  // Helper function to get total stock (product + child products + inline variations)
  const getTotalStock = (product: BlingProduct): number => {
    const productStock = product.estoque_atual || 0;
    // Stock from child products in DB (if any exist separately)
    const childStock = variationData?.get(product.bling_id)?.stock || 0;
    // Stock from inline variations in JSONB
    const inlineStock = getInlineVariationStock(product);
    return productStock + childStock + inlineStock;
  };

  // Helper to get primary image URL (from imagens JSONB or fallback to imagem_url)
  const getProductImage = (product: BlingProduct): string | null => {
    const imagens = product.imagens as Array<{ link: string }> | null;
    if (imagens && imagens.length > 0 && imagens[0].link) {
      return imagens[0].link;
    }
    return product.imagem_url || null;
  };

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`bling-products-${integrationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bling_products',
          filter: `integration_id=eq.${integrationId}`
        },
        () => {
          refetchProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [integrationId, refetchProducts]);

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "Nunca";
    }
  };

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    const filtered = products.filter(product => {
      const matchesSearch = searchQuery === "" || 
        product.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.codigo && product.codigo.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Check stock including inline variations and child products - reactive to variationData
      const childStock = variationData?.get(product.bling_id)?.stock || 0;
      const inlineStock = getInlineVariationStock(product);
      const totalStock = (product.estoque_atual || 0) + childStock + inlineStock;
      const matchesStock = !showOnlyInStock || totalStock > 0;
      
      return matchesSearch && matchesStock;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.nome.localeCompare(b.nome, 'pt-BR');
        case 'name_desc':
          return b.nome.localeCompare(a.nome, 'pt-BR');
        case 'price_asc':
          return (a.preco || 0) - (b.preco || 0);
        case 'price_desc':
          return (b.preco || 0) - (a.preco || 0);
        case 'stock_asc':
          return getTotalStock(a) - getTotalStock(b);
        case 'stock_desc':
          return getTotalStock(b) - getTotalStock(a);
        default:
          return 0;
      }
    });
  }, [products, searchQuery, showOnlyInStock, sortBy, variationData]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // Reset page when filters change (including variationData)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, showOnlyInStock, sortBy, variationData]);

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStockBadge = (quantity: number | null) => {
    const qty = quantity || 0;
    if (qty === 0) {
      return <Badge className="bg-destructive text-destructive-foreground">Sem estoque</Badge>;
    }
    if (qty <= 5) {
      return (
        <Badge className="bg-yellow-500 text-white gap-1">
          <AlertTriangle className="h-3 w-3" />
          Baixo: {qty}
        </Badge>
      );
    }
    return <Badge className="bg-green-500 text-white">{qty} un</Badge>;
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 5;
    
    if (totalPages <= showPages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  const handleExportCSV = async () => {
    if (!products || products.length === 0) {
      toast({
        title: "Nenhum produto",
        description: "Não há produtos para exportar.",
        variant: "destructive"
      });
      return;
    }

    setIsExporting(true);
    try {
      const headers = [
        'Código', 'Nome', 'Preço Venda', 'Preço Custo', 'Margem %', 'Estoque Atual', 'Estoque Mínimo',
        'Categoria', 'Marca', 'Situação', 'Condição', 'NCM', 'GTIN/EAN',
        'Fornecedor', 'Código Fornecedor', 'Altura (cm)', 'Largura (cm)', 'Profundidade (cm)',
        'Peso Líquido (kg)', 'Peso Bruto (kg)', 'Unidade', 'Localização', 'Tem Variações', 'Qtd Imagens'
      ];
      
      const rows = products.map(p => {
        const margem = p.preco && p.preco_custo && p.preco_custo > 0 
          ? (((p.preco - p.preco_custo) / p.preco_custo) * 100).toFixed(1)
          : '';
        const imagens = p.imagens as Array<{ link: string }> | null;
        const variacoes = p.variacoes as Array<unknown> | null;
        const condicaoLabel = p.condicao === 1 ? 'Novo' : p.condicao === 2 ? 'Usado' : '';
        
        return [
          p.codigo || '',
          p.nome,
          p.preco?.toString() || '',
          p.preco_custo?.toString() || '',
          margem,
          p.estoque_atual?.toString() || '0',
          p.estoque_minimo?.toString() || '',
          p.categoria_nome || '',
          p.marca || '',
          p.situacao || '',
          condicaoLabel,
          p.ncm || '',
          p.gtin || p.ean || '',
          p.fornecedor_nome || '',
          p.fornecedor_codigo || '',
          p.altura?.toString() || '',
          p.largura?.toString() || '',
          p.profundidade?.toString() || '',
          p.peso_liquido?.toString() || '',
          p.peso_bruto?.toString() || '',
          p.unidade || '',
          p.localizacao || '',
          variacoes && variacoes.length > 0 ? 'Sim' : 'Não',
          imagens ? imagens.length.toString() : p.imagem_url ? '1' : '0'
        ];
      });

      const csvContent = [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `produtos-bling-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída",
        description: `${products.length} produtos exportados com sucesso.`
      });
    } catch (error) {
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar os produtos.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Count images for a product
  const getImageCount = (product: BlingProduct) => {
    const imagens = product.imagens as Array<{ link: string }> | null;
    if (imagens && imagens.length > 0) return imagens.length;
    if (product.imagem_url) return 1;
    return 0;
  };




  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/products')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{integration?.name || 'Produtos Bling'}</h1>
            <p className="text-muted-foreground">
              Produtos sincronizados do Bling
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {syncStatus !== 'idle' && syncStatus !== 'completed' && syncStatus !== 'failed' && syncStatus !== 'cancelled' ? (
            <Button
              variant="destructive"
              onClick={cancelSync}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar Sync
            </Button>
          ) : (
            <>
              <Button
                onClick={() => startSync()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Sincronizar Produtos
              </Button>
              <Button
                variant="outline"
                onClick={updateStock}
                title="Atualiza o estoque dos produtos existentes consultando a API do Bling"
              >
                <PackageSearch className="h-4 w-4 mr-2" />
                Atualizar Estoque
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={isExporting || !products?.length}
          >
            <Download className={`h-4 w-4 mr-2 ${isExporting ? 'animate-pulse' : ''}`} />
            {isExporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
          <DeleteIntegrationDataButton
            integrationId={integrationId}
            dataType="produtos"
            tablesToDelete={[{ table: 'bling_products' }]}
            onDeleted={() => {
              queryClient.invalidateQueries({ queryKey: ['bling-products', integrationId] });
            }}
          />
          <Button 
            variant="outline" 
            onClick={() => refetchProducts()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Sync Progress */}
      {(syncStatus === 'syncing' || syncStatus === 'pending') && (
        <Card className={`border-primary/50 ${isStuck ? 'bg-yellow-500/10 border-yellow-500/50' : 'bg-primary/5'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              {isStuck ? (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">
                    {isStuck 
                      ? 'Sincronização pausada - aguardando retomada automática'
                      : syncStatus === 'pending'
                        ? 'Sincronização em fila - aguardando processamento...'
                        : 'Sincronizando produtos...'}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {currentJob?.total_count && currentJob.total_count > 0
                      ? `${Math.round(((currentJob.saved_count || 0) / currentJob.total_count) * 100)}%`
                      : 'Iniciando...'}
                  </span>
                </div>
                <Progress 
                  value={currentJob?.total_count && currentJob.total_count > 0 
                    ? ((currentJob.saved_count || 0) / currentJob.total_count) * 100 
                    : 0}
                  className="h-2"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {currentJob?.saved_count || 0} de {currentJob?.total_count || '?'} salvos
              </span>
              <span className="flex items-center gap-2">
                Página {currentJob?.current_page || 1} • Próxima: {currentJob?.resume_page || '-'}
                {lastHeartbeatAgo !== null && (
                  <span className={isStuck ? 'text-yellow-600 font-medium' : ''}>
                    • Última atividade: {Math.round(lastHeartbeatAgo / 1000)}s atrás
                  </span>
                )}
              </span>
            </div>
            {isStuck && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={resumeSync}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Forçar Retomada
                </Button>
                <span className="text-xs text-muted-foreground">
                  O CRON retomará automaticamente em até 1 minuto
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enrichment Progress */}
      {(enrichmentStatus === 'syncing' || enrichmentStatus === 'pending') && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">
                    Enriquecendo produtos (imagens, variações, detalhes)...
                  </span>
                  <span className="text-sm font-bold text-blue-600">
                    {enrichmentJob?.total_count && enrichmentJob.total_count > 0
                      ? `${Math.round(((enrichmentJob.saved_count || 0) / enrichmentJob.total_count) * 100)}%`
                      : 'Processando...'}
                  </span>
                </div>
                <Progress 
                  value={enrichmentJob?.total_count && enrichmentJob.total_count > 0 
                    ? ((enrichmentJob.saved_count || 0) / enrichmentJob.total_count) * 100 
                    : 0}
                  className="h-2"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {enrichmentJob?.saved_count || 0} de {enrichmentJob?.total_count || '?'} produtos enriquecidos
              </span>
              <span>
                Buscando imagens e variações do Bling...
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auto-Sync Status + Actions */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <SyncStatusBadge
                integrationId={integrationId}
                syncType="products"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={checkForNew}
                disabled={syncStatus === 'syncing' || syncStatus === 'pending'}
              >
                <PackageSearch className="h-4 w-4 mr-2" />
                Buscar Novos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={updateStock}
                disabled={syncStatus === 'syncing' || syncStatus === 'pending'}
              >
                <RotateCw className="h-4 w-4 mr-2" />
                Atualizar Estoque
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{products?.length || 0}</div>
            <p className="text-sm text-muted-foreground">Total de Produtos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {products?.filter(p => getTotalStock(p) > 0).length || 0}
            </div>
            <p className="text-sm text-muted-foreground">Em Estoque</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {products?.filter(p => getTotalStock(p) === 0).length || 0}
            </div>
            <p className="text-sm text-muted-foreground">Sem Estoque</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold flex items-center gap-2">
              {products?.filter(p => getImageCount(p) > 0).length || 0}
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Com Imagens</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-sm">
              {formatLastSync(integration?.last_sync_products_at || null)}
            </div>
            <p className="text-sm text-muted-foreground">Última Sync</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome ou código..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-md bg-background"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="inStock"
            checked={showOnlyInStock}
            onCheckedChange={(checked) => setShowOnlyInStock(checked as boolean)}
          />
          <Label htmlFor="inStock" className="text-sm cursor-pointer">
            Apenas em estoque
          </Label>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              Ordenar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48">
            <div className="space-y-2">
              {SORT_OPTIONS.map(option => (
                <Button
                  key={option.value}
                  variant={sortBy === option.value ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setSortBy(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : paginatedProducts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum produto encontrado</h3>
            <p className="text-muted-foreground text-center">
              {searchQuery ? 'Tente ajustar sua busca.' : 'Os produtos sincronizados aparecerão aqui.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {paginatedProducts.map((product) => {
              const imageCount = getImageCount(product);
              // Count of child products from database
              const childCount = variationData?.get(product.bling_id)?.count || 0;
              // Count of inline variations from JSONB
              const inlineVariations = product.variacoes as Array<unknown> | null;
              const inlineCount = inlineVariations?.length || 0;
              // Total variations = children from DB + inline from JSONB
              const totalVariationCount = childCount + inlineCount;
              // Total stock including variations
              const totalStock = getTotalStock(product);
              
              return (
                <Card 
                  key={product.id} 
                  className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    setSelectedProduct(product);
                    setDialogOpen(true);
                  }}
                >
                  <div className="aspect-square bg-muted flex items-center justify-center relative">
                    {(() => {
                      const imageUrl = getProductImage(product);
                      return imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.nome}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <ImageOff className="h-10 w-10 text-muted-foreground/50" />
                          <span className="text-xs text-muted-foreground/50">Sem imagem</span>
                        </div>
                      );
                    })()}
                    
                    {/* Image count badge */}
                    {imageCount > 1 && (
                      <div className="absolute top-2 right-2 bg-background/80 px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" />
                        {imageCount}
                      </div>
                    )}
                    
                    {/* Variations count badge - show only if has variations */}
                    {totalVariationCount > 0 && (
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {totalVariationCount}
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-medium text-sm line-clamp-2 mb-1">{product.nome}</h3>
                    <p className="text-xs text-muted-foreground mb-2">{product.codigo || '-'}</p>
                    
                    {/* Feature badges */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {product.fornecedor_nome && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          <Building2 className="h-2.5 w-2.5 mr-0.5" />
                          Forn.
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm">{formatCurrency(product.preco)}</span>
                      {getStockBadge(totalStock)}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Itens por página:</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(v) => {
                    setItemsPerPage(Number(v));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEMS_PER_PAGE_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt.toString()}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {getPageNumbers().map((page, idx) => (
                  <Button
                    key={idx}
                    variant={page === currentPage ? "default" : "outline"}
                    size="icon"
                    onClick={() => typeof page === 'number' && goToPage(page)}
                    disabled={typeof page !== 'number'}
                  >
                    {page}
                  </Button>
                ))}

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <span className="text-sm text-muted-foreground">
                {filteredProducts.length} produtos
              </span>
            </div>
          )}
        </>
      )}

      {/* Product Details Dialog */}
      <BlingProductDetailsDialog
        product={selectedProduct}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}