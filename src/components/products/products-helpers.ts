import { Tables } from "@/integrations/supabase/types";

export type Product = Tables<'li_products'>;

export const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

export type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc' | 'margin_asc' | 'margin_desc';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name_asc', label: 'Nome (A-Z)' },
  { value: 'name_desc', label: 'Nome (Z-A)' },
  { value: 'price_asc', label: 'Preço (menor)' },
  { value: 'price_desc', label: 'Preço (maior)' },
  { value: 'stock_asc', label: 'Estoque (menor)' },
  { value: 'stock_desc', label: 'Estoque (maior)' },
  { value: 'margin_asc', label: 'Margem (menor)' },
  { value: 'margin_desc', label: 'Margem (maior)' },
];

/** Extract data from raw_json */
export const getRaw = (product: Product, key: string): unknown => {
  const raw = product.raw_json as any | null;
  return raw?.[key] ?? null;
};

/** Get real stock from raw_json (estoque_quantidade) since column `stock` may be 0 */
export const getProductStock = (product: Product): number => {
  const rawQty = getRaw(product, 'estoque_quantidade');
  if (typeof rawQty === 'number' && rawQty > 0) return rawQty;
  return product.stock || 0;
};

/** Normalize loja_integrada_product_id to string */
export const normalizeLiId = (value: number | string | null | undefined): string => {
  if (value == null) return '';
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  return String(Math.round(num));
};

export const getInlineVariationStock = (product: Product): number => {
  const variacoes = product.variations_json as unknown;
  if (!Array.isArray(variacoes)) return 0;

  return variacoes.reduce((sum: number, v: Record<string, unknown>) => {
    const candidates = [
      v?.estoque_quantidade,
      v?.estoque,
      v?.estoque_atual,
      v?.estoqueDisponivel,
      v?.estoque_disponivel,
      v?.quantidade_estoque,
    ];
    const qty = candidates.find((x) => typeof x === 'number') ?? 0;
    return sum + (typeof qty === 'number' ? qty : 0);
  }, 0);
};

export const calculateMargin = (product: Product): number | null => {
  const sellPrice = product.promotional_price || product.price;
  const costPrice = product.cost_price;
  if (!sellPrice || !costPrice || costPrice === 0) return null;
  return ((sellPrice - costPrice) / costPrice) * 100;
};

export const normalizeType = (name: string) => {
  const firstWord = name.split(' ')[0];
  if (!firstWord) return '';
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
};

export const getBaseName = (name: string) => {
  return name
    .replace(/\s*[-–]\s*Tamanho:.*$/i, '')
    .replace(/\s*[-–]\s*Cor:.*$/i, '')
    .replace(/\s*Tamanho:.*$/i, '')
    .replace(/\s*Cor:.*$/i, '')
    .replace(/\s*;\s*.*$/, '')
    .trim();
};

export const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};
