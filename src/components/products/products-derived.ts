// Funções puras derivadas da lista de produtos (sem React): usadas por useProductsData.
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Product,
  getRaw,
  getProductStock,
  normalizeLiId,
  getInlineVariationStock,
  calculateMargin,
  normalizeType,
  getBaseName,
} from "./products-helpers";

export type VariationData = { count: number; stock: number };

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
