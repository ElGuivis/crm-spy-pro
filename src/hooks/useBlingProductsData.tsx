import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tables } from "@/integrations/supabase/types";
import { BLING_PRODUCT_SELECT } from "@/components/products/product-select-columns";
import { brtDate } from "@/lib/brt";
import { type BlingProductRow, normalizeBlingProducts } from "@/components/catalogo/catalogoHelpers";
import { childrenStock, linkBlingVariations } from "@/components/catalogo/blingVariations";
import { fetchBlingStockRows } from "@/components/catalogo/blingStockRows";
import {
  type CatalogFilterState, DEFAULT_CATALOG_FILTERS, applyCatalogFilters, buildCatalogFilterOptions,
} from "@/components/catalogo/catalogFilters";

const PAGE = 1000; // limite de linhas por resposta do PostgREST

type BlingProduct = Tables<"bling_products">;

/** Estoque somado das variações que já vêm dentro do próprio produto. */
const getInlineVariationStock = (product: BlingProduct): number => {
  const variacoes = product.variacoes as Array<{ estoque?: { saldoVirtualTotal?: number } }> | null;
  if (!variacoes?.length) return 0;
  return variacoes.reduce((sum, v) => sum + (v.estoque?.saldoVirtualTotal || 0), 0);
};

export function useBlingProductsData(integrationId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // mesmos filtros do Catálogo WhatsApp (busca, tipo, cor, tamanho, ordem, só com estoque)
  const [filters, setFilters] = useState<CatalogFilterState>({ ...DEFAULT_CATALOG_FILTERS, onlyInStock: false });
  const setFilter = useCallback(<K extends keyof CatalogFilterState>(key: K, value: CatalogFilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);
  const resetFilters = useCallback(() => setFilters(prev => ({ ...DEFAULT_CATALOG_FILTERS, onlyInStock: false, sort: prev.sort })), []);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [isExporting, setIsExporting] = useState(false);

  const { data: integration } = useQuery({
    queryKey: ["integration-info", integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("integrations")
        .select("name, last_sync_products_at, auto_sync_products, auto_sync_products_interval")
        .eq("id", integrationId)
        .single();
      return data as {
        name: string;
        last_sync_products_at: string | null;
        auto_sync_products: boolean;
        auto_sync_products_interval: number;
      } | null;
    },
  });

  const { data: products, isLoading, refetch: refetchProducts } = useQuery({
    queryKey: ["bling-products", integrationId],
    queryFn: async () => {
      // em páginas: uma consulta só parava em 1.000 produtos
      const all: BlingProduct[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("bling_products")
          .select(BLING_PRODUCT_SELECT)
          .eq("integration_id", integrationId)
          .is("produto_pai_id", null)
          .or("formato.eq.V,and(formato.eq.S,nome.not.ilike.%Tamanho:%,nome.not.ilike.%;%)")
          .order("nome", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1)
          .returns<BlingProduct[]>();
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < PAGE) return all;
      }
    },
  });

  // linhas das variações (em páginas: antes parava em 1.000 das ~3 mil); são elas que o Bling atualiza a cada venda
  const { data: stockRows } = useQuery({
    queryKey: ["bling-variation-data", integrationId],
    queryFn: () => fetchBlingStockRows(integrationId),
    enabled: !!integrationId,
  });
  const kids = useMemo(
    () => (stockRows && products ? linkBlingVariations(products, stockRows).kids : undefined),
    [stockRows, products],
  );

  const variationData = useMemo(() => {
    const m = new Map<number, { count: number; stock: number }>();
    kids?.forEach((rows, pid) => m.set(pid, { count: rows.length, stock: childrenStock(rows) }));
    return m;
  }, [kids]);

  // variações em linhas valem sozinhas; o JSON do pai só conta quando não há linhas (antes somava os dois = estoque em dobro)
  const getTotalStock = useCallback((product: BlingProduct): number => {
    const rows = kids?.get(product.bling_id);
    return Math.max(product.estoque_atual || 0, 0) + (rows?.length ? childrenStock(rows) : getInlineVariationStock(product));
  }, [kids]);

  const getProductImage = (product: BlingProduct): string | null => {
    const imagens = product.imagens as Array<{ link: string }> | null;
    return (imagens?.length && imagens[0].link) ? imagens[0].link : product.imagem_url || null;
  };

  const getImageCount = (product: BlingProduct): number => {
    const imagens = product.imagens as Array<{ link: string }> | null;
    if (imagens?.length) return imagens.length;
    return product.imagem_url ? 1 : 0;
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR }); }
    catch { return "Nunca"; }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return "-";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const getStockBadge = (quantity: number | null) => {
    const qty = quantity || 0;
    if (qty === 0) return <Badge className="bg-destructive text-destructive-foreground">Sem estoque</Badge>;
    if (qty <= 5) return <Badge className="bg-yellow-500 text-white gap-1"><AlertTriangle className="h-3 w-3" />Baixo: {qty}</Badge>;
    return <Badge className="bg-green-500 text-white">{qty} un</Badge>;
  };

  const { filteredProducts, filterOptions } = useMemo(() => {
    const rows = products ?? [];
    const byId = new Map(rows.map(p => [p.id, p]));
    const all = normalizeBlingProducts(rows as unknown as BlingProductRow[], kids)
      .map((c, i) => ({ ...c, stock: getTotalStock(rows[i]) }));
    const base = filters.onlyInStock ? all.filter(c => c.stock > 0) : all;
    return {
      filterOptions: buildCatalogFilterOptions(base),
      filteredProducts: applyCatalogFilters(base, filters).map(c => byId.get(c.id)!).filter(Boolean),
    };
  }, [products, kids, filters, getTotalStock]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const handleExportCSV = async () => {
    if (!products?.length) {
      toast({ title: "Nenhum produto", description: "Não há produtos para exportar.", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const headers = [
        "Código", "Nome", "Preço Venda", "Preço Custo", "Margem %", "Estoque Atual", "Estoque Mínimo",
        "Categoria", "Marca", "Situação", "Condição", "NCM", "GTIN/EAN",
        "Fornecedor", "Código Fornecedor", "Altura (cm)", "Largura (cm)", "Profundidade (cm)",
        "Peso Líquido (kg)", "Peso Bruto (kg)", "Unidade", "Localização", "Tem Variações", "Qtd Imagens",
      ];
      const rows = products.map(p => {
        const margem = p.preco && p.preco_custo && p.preco_custo > 0
          ? (((p.preco - p.preco_custo) / p.preco_custo) * 100).toFixed(1) : "";
        const imagens = p.imagens as Array<{ link: string }> | null;
        const variacoes = p.variacoes as Array<unknown> | null;
        return [
          p.codigo || "", p.nome,
          p.preco?.toString() || "", p.preco_custo?.toString() || "", margem,
          p.estoque_atual?.toString() || "0", p.estoque_minimo?.toString() || "",
          p.categoria_nome || "", p.marca || "", p.situacao || "",
          p.condicao === 1 ? "Novo" : p.condicao === 2 ? "Usado" : "",
          p.ncm || "", p.gtin || p.ean || "",
          p.fornecedor_nome || "", p.fornecedor_codigo || "",
          p.altura?.toString() || "", p.largura?.toString() || "", p.profundidade?.toString() || "",
          p.peso_liquido?.toString() || "", p.peso_bruto?.toString() || "",
          p.unidade || "", p.localizacao || "",
          variacoes?.length ? "Sim" : "Não",
          imagens ? imagens.length.toString() : p.imagem_url ? "1" : "0",
        ];
      });
      const csv = [headers.join(";"), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";"))].join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `produtos-bling-${brtDate()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Exportação concluída", description: `${products.length} produtos exportados com sucesso.` });
    } catch {
      toast({ title: "Erro na exportação", description: "Não foi possível exportar os produtos.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return {
    integration, products, variationData, isLoading, refetchProducts,
    filters, setFilter, resetFilters, filterOptions,
    currentPage, setCurrentPage,
    itemsPerPage, setItemsPerPage,
    isExporting, handleExportCSV,
    filteredProducts, paginatedProducts, totalPages,
    getTotalStock, getProductImage, getImageCount,
    formatLastSync, formatCurrency, getStockBadge,
  };
}
