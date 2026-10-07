import { Tables } from "@/integrations/supabase/types";
import { jsonAs } from "@/lib/json-access";

export type Product = Tables<'li_products'>;

export interface LIImage {
  grande?: string;
  media?: string;
  pequena?: string;
  pequeno?: string;
}

/** Campo do `raw_json` da loja; o tipo esperado é declarado por quem chama (padrão: texto exibível). */
export const getRaw = <T = string>(product: Product, key: string): T | null => {
  const raw = jsonAs<Record<string, unknown>>(product.raw_json);
  return (raw?.[key] ?? null) as T | null;
};

export const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

export const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const parseImages = (raw: unknown): LIImage[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as LIImage[];
  return [];
};

export const parseAttributes = (atributos: unknown): Array<{ nome: string; valores: string[] }> => {
  if (!atributos) return [];
  if (Array.isArray(atributos)) return atributos as Array<{ nome: string; valores: string[] }>;
  return [];
};

/** Extract variation attributes from a child name like "Camisa... Tamanho:P;Cor:Preto" */
export const extractVariationAttributes = (childName: string, parentName: string): Array<{ key: string; value: string }> => {
  const attrs: Array<{ key: string; value: string }> = [];
  let attrPart = childName;
  if (parentName && childName.startsWith(parentName)) {
    attrPart = childName.slice(parentName.length).trim();
    attrPart = attrPart.replace(/^[-–]\s*/, '');
  }
  const parts = attrPart.split(';');
  parts.forEach(part => {
    const colonIndex = part.indexOf(':');
    if (colonIndex > 0) {
      const key = part.slice(0, colonIndex).trim();
      const value = part.slice(colonIndex + 1).trim();
      if (key && value) attrs.push({ key, value });
    }
  });
  return attrs;
};

export const getProductImages = (product: Product) => {
  const productImages = parseImages(getRaw(product, 'imagens'));
  return productImages.map(img => ({
    link: img.grande || img.media || img.pequena || img.pequeno || ''
  })).filter(img => img.link);
};

export const getStockQuantity = (product: Product): number => {
  const rawEstoque = getRaw(product, 'estoque_quantidade');
  return (typeof rawEstoque === 'number' && rawEstoque > 0) ? rawEstoque : (product.stock || 0);
};

export const getStockStatus = (qty: number) => {
  if (qty === 0) return { label: 'Sem estoque', color: 'bg-destructive text-destructive-foreground' };
  if (qty <= 5) return { label: 'Estoque baixo', color: 'bg-yellow-500 text-white' };
  return { label: 'Em estoque', color: 'bg-green-500 text-white' };
};

export const calculateMargin = (product: Product): string | null => {
  if (!product.cost_price || !product.price) return null;
  const margin = ((product.price - product.cost_price) / product.price) * 100;
  return margin.toFixed(1);
};

/** Image for a child product with inheritance from parent and fallback. */
export const getChildImage = (
  child: Product,
  parent: Product,
  parentFormattedImages: { link: string }[],
  fallbackImage?: string | null,
): string | null => {
  if (child.image_url) return child.image_url;
  const childImages = parseImages(getRaw(child, 'imagens'));
  if (childImages.length > 0) {
    const img = childImages[0];
    const url = img.grande || img.media || img.pequena || img.pequeno;
    if (url) return url;
  }
  const imgPrincipal = getRaw<{ grande?: string; media?: string; pequena?: string }>(child, 'imagem_principal');
  if (imgPrincipal) {
    const url = imgPrincipal?.grande || imgPrincipal?.media || imgPrincipal?.pequena;
    if (url) return url;
  }
  if (parentFormattedImages.length > 0) return parentFormattedImages[0].link;
  return parent.image_url || fallbackImage || null;
};
