// Funções puras derivadas da lista de produtos (sem React): usadas por useProductsData.
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Product,
  SortOption,
  getRaw,
  getProductStock,
  normalizeLiId,
  getInlineVariationStock,
  calculateMargin,
  normalizeType,
  getBaseName,
} from "./products-helpers";

export type VariationData = { count: number; stock: number };

export interface ProductFilters {
  searchQuery: string;
  showOnlyInStock: boolean;
  selectedTypes: string[];
  isPriceFilterActive: boolean;
  priceRange: [number, number];
  isMarginFilterActive: boolean;
  marginRange: [number, number];
  sortBy: SortOption;
}

/** Separa produtos "pai" das variações (tipo `atributo_opcao`) e agrega contagem/estoque por pai. */
export function splitParentsAndVariations(allProducts: Product[] | undefined) {
  if (!allProducts) {
    return { parentProducts: [] as Product[], variationDataMap: new Map<string, VariationData>(), parentCount: 0, variationCount: 0 };
  }
  const parents: Product[] = [];
  const varMap = new Map<string, VariationData>();
  let varCount = 0;
  allProducts.forEach((p) => {
    const tipo = getRaw(p, 'tipo');
    if (tipo === 'atributo_opcao') {
      varCount++;
      const paiUri = getRaw(p, 'pai') as string | null;
      if (paiUri) {
        const match = (paiUri as string).match(/\/produto\/(\d+)/);
        if (match) {
          const parentKey = match[1];
          const current = varMap.get(parentKey) || { count: 0, stock: 0 };
          varMap.set(parentKey, { count: current.count + 1, stock: current.stock + getProductStock(p) });
        }
      }
    } else {
      parents.push(p);
    }
  });
  return { parentProducts: parents, variationDataMap: varMap, parentCount: parents.length, variationCount: varCount };
}

export function totalStockOf(product: Product, variationDataMap: Map<string, VariationData> | undefined): number {
  const productKey = normalizeLiId(product.loja_integrada_product_id);
  const childStock = productKey ? variationDataMap?.get(productKey)?.stock || 0 : 0;
  const inlineStock = getInlineVariationStock(product);
  const variationCount = productKey ? variationDataMap?.get(productKey)?.count || 0 : 0;
  const hasInlineVariations = Array.isArray(product.variations_json) && (product.variations_json as unknown[]).length > 0;
  if (variationCount > 0 || hasInlineVariations) return childStock + inlineStock;
  return getProductStock(product);
}

export function variationCountOf(product: Product, variationDataMap: Map<string, VariationData> | undefined): number {
  const productKey = normalizeLiId(product.loja_integrada_product_id);
  return productKey ? variationDataMap?.get(productKey)?.count || 0 : 0;
}

/** Imagem de reserva por nome-base (para variações/produtos sem imagem própria). */
export function buildImageMap(parentProducts: Product[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!parentProducts) return map;
  parentProducts.forEach((product) => {
    if (product.image_url) {
      const baseName = getBaseName(product.name);
      if (!map.has(baseName)) map.set(baseName, product.image_url);
    }
  });
  return map;
}

export function productImageOf(product: Product, imageMap: Map<string, string>): string | null {
  if (product.image_url) return product.image_url;
  const imagemPrincipal = getRaw(product, 'imagem_principal') as Record<string, string> | null;
  if (imagemPrincipal) {
    const url = imagemPrincipal?.grande || imagemPrincipal?.media || imagemPrincipal?.pequena;
    if (url) return url;
  }
  const baseName = getBaseName(product.name);
  return imageMap.get(baseName) || null;
}

export function collectProductTypes(parentProducts: Product[] | undefined): string[] {
  if (!parentProducts) return [];
  const types = new Set<string>();
  parentProducts.forEach((product) => {
    const type = normalizeType(product.name);
    if (type) types.add(type);
  });
  return Array.from(types).sort();
}

export function computeMaxima(parentProducts: Product[] | undefined): { maxPrice: number; maxMargin: number } {
  if (!parentProducts) return { maxPrice: 10000, maxMargin: 100 };
  let maxP = 0;
  let maxM = 0;
  parentProducts.forEach((product) => {
    const price = product.promotional_price || product.price || 0;
    if (price > maxP) maxP = price;
    const margin = calculateMargin(product);
    if (margin !== null && margin > maxM) maxM = margin;
  });
  return { maxPrice: Math.ceil(maxP / 100) * 100, maxMargin: Math.min(Math.ceil(maxM / 10) * 10, 500) };
}

export function filterAndSortProducts(
  parentProducts: Product[] | undefined,
  f: ProductFilters,
  getTotalStock: (product: Product) => number,
): Product[] {
  if (!parentProducts) return [];
  const filtered = parentProducts.filter((product) => {
    const matchesSearch = f.searchQuery === "" ||
      product.name.toLowerCase().includes(f.searchQuery.toLowerCase()) ||
      (product.sku && product.sku.toLowerCase().includes(f.searchQuery.toLowerCase()));
    const totalStock = getTotalStock(product);
    const matchesStock = !f.showOnlyInStock || totalStock > 0;
    const productType = normalizeType(product.name);
    const matchesType = f.selectedTypes.length === 0 || f.selectedTypes.includes(productType);
    const productPrice = product.promotional_price || product.price || 0;
    const matchesPrice = !f.isPriceFilterActive || (productPrice >= f.priceRange[0] && productPrice <= f.priceRange[1]);
    const margin = calculateMargin(product);
    const matchesMargin = !f.isMarginFilterActive || (margin !== null && margin >= f.marginRange[0] && margin <= f.marginRange[1]);
    return matchesSearch && matchesStock && matchesType && matchesPrice && matchesMargin;
  });

  return filtered.sort((a, b) => {
    switch (f.sortBy) {
      case 'name_asc': return a.name.localeCompare(b.name, 'pt-BR');
      case 'name_desc': return b.name.localeCompare(a.name, 'pt-BR');
      case 'price_asc': return (a.promotional_price || a.price || 0) - (b.promotional_price || b.price || 0);
      case 'price_desc': return (b.promotional_price || b.price || 0) - (a.promotional_price || a.price || 0);
      case 'stock_asc': return getTotalStock(a) - getTotalStock(b);
      case 'stock_desc': return getTotalStock(b) - getTotalStock(a);
      case 'margin_asc': return (calculateMargin(a) ?? -Infinity) - (calculateMargin(b) ?? -Infinity);
      case 'margin_desc': return (calculateMargin(b) ?? -Infinity) - (calculateMargin(a) ?? -Infinity);
      default: return 0;
    }
  });
}

export function buildPageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = [];
  const showPages = 5;
  if (totalPages <= showPages) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else if (currentPage <= 3) {
    for (let i = 1; i <= 4; i++) pages.push(i);
    pages.push('...', totalPages);
  } else if (currentPage >= totalPages - 2) {
    pages.push(1, '...');
    for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1, '...');
    for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
    pages.push('...', totalPages);
  }
  return pages;
}

export function getMostRecentSync(row: Record<string, unknown> | null): string | null {
  if (!row) return null;
  const candidates = [row.last_sync_products_at, row.last_products_sync_at, row.last_sync_at].filter(Boolean) as string[];
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, current) => (new Date(current) > new Date(latest) ? current : latest));
}

export function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return "Nunca";
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR }); } catch { return "Nunca"; }
}
