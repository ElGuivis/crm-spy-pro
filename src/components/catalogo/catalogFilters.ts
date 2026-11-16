import type { CatalogProduct } from "./catalogoHelpers";

export type CatalogSort = "recent" | "name" | "price_asc" | "price_desc" | "stock";

export interface CatalogFilterState {
  search: string;
  type: string;
  color: string;
  size: string;
  onlyInStock: boolean;
  /** mostra também produtos desativados na loja que ainda têm estoque */
  includeOffSite: boolean;
  sort: CatalogSort;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilterState = {
  search: "", type: "", color: "", size: "", onlyInStock: true, includeOffSite: false, sort: "recent",
};

export const SORT_LABELS: Record<CatalogSort, string> = {
  recent: "Mais recentes", name: "Nome (A–Z)", price_asc: "Menor preço", price_desc: "Maior preço", stock: "Mais estoque",
};

const COLOR_KEYS = new Set(["cor", "color"]);
const SIZE_KEYS = new Set(["tamanho", "size", "numeracao", "numero"]);

/** minúsculas e sem acento, para busca e comparação */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const attrOf = (attrs: Record<string, string>, keys: Set<string>) => {
  for (const [k, v] of Object.entries(attrs)) if (keys.has(fold(k))) return v;
  return undefined;
};
export const colorOf = (attrs: Record<string, string>) => attrOf(attrs, COLOR_KEYS);
export const sizeOf = (attrs: Record<string, string>) => attrOf(attrs, SIZE_KEYS);

/** Tipo do produto = primeira palavra do nome ("Camiseta", "Boné"...). */
export function productType(name: string): string {
  const w = name.trim().split(/\s+/)[0] ?? "";
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "";
}

const SIZE_ORDER = ["RN", "PP", "P", "M", "G", "GG", "XG", "EG", "EXG", "XGG", "EGG", "G1", "G2", "G3", "G4", "G5", "X1", "X2", "X3", "X4", "X5", "U", "UN", "UNICO"];
/** Ordem de grade: PP, P, M, G, GG... depois numéricos (36, 38, 40/41) e o resto em ordem alfabética. */
export function compareSizes(a: string, b: string): number {
  const ia = SIZE_ORDER.indexOf(fold(a).toUpperCase()), ib = SIZE_ORDER.indexOf(fold(b).toUpperCase());
  if (ia >= 0 || ib >= 0) return ia < 0 ? 1 : ib < 0 ? -1 : ia - ib;
  const na = parseFloat(a), nb = parseFloat(b);
  if (!isNaN(na) || !isNaN(nb)) return isNaN(na) ? 1 : isNaN(nb) ? -1 : na - nb;
  return a.localeCompare(b, "pt-BR");
}

/** Produtos que entram na tela antes dos filtros de busca/tipo/cor/tamanho (foto, estoque, fora do site). */
export function baseCatalog(products: CatalogProduct[], f: Pick<CatalogFilterState, "onlyInStock" | "includeOffSite">) {
  const visible: CatalogProduct[] = [];
  let withoutPhoto = 0;
  let offSite = 0;
  for (const p of products) {
    if (f.onlyInStock && p.stock <= 0) continue;
    if (!p.imageUrl) { withoutPhoto++; continue; }
    if (!p.onSite) { offSite++; if (!f.includeOffSite) continue; }
    visible.push(p);
  }
  return { visible, withoutPhoto, offSite };
}

export interface CatalogFilterOptions {
  types: { value: string; count: number }[];
  colors: string[];
  sizes: string[];
}

export function buildCatalogFilterOptions(products: CatalogProduct[]): CatalogFilterOptions {
  const types = new Map<string, number>();
  const colors = new Map<string, string>();
  const sizes = new Map<string, string>();
  for (const p of products) {
    const t = productType(p.name);
    if (t) types.set(t, (types.get(t) ?? 0) + 1);
    for (const v of p.variants) {
      const c = colorOf(v.attrs), s = sizeOf(v.attrs);
      if (c && !colors.has(fold(c))) colors.set(fold(c), c);
      if (s && !sizes.has(fold(s))) sizes.set(fold(s), s);
    }
  }
  return {
    types: [...types].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value, "pt-BR")),
    colors: [...colors.values()].sort((a, b) => a.localeCompare(b, "pt-BR")),
    sizes: [...sizes.values()].sort(compareSizes),
  };
}

/** Cor e tamanho valem para a MESMA variação em estoque (Preto + M = existe M preto). */
function matchesVariant(p: CatalogProduct, color: string, size: string): boolean {
  if (!color && !size) return true;
  if (p.variants.length === 0) {
    // produto sem grade (ex.: carteira "... - Azul"): a cor costuma estar no nome; tamanho não se aplica
    return !size && fold(p.name).includes(fold(color));
  }
  return p.variants.some(v =>
    v.stock > 0
    && (!color || fold(colorOf(v.attrs) ?? "") === fold(color))
    && (!size || fold(sizeOf(v.attrs) ?? "") === fold(size)));
}

export function applyCatalogFilters(products: CatalogProduct[], f: CatalogFilterState): CatalogProduct[] {
  const words = fold(f.search).split(/\s+/).filter(Boolean);
  const out = products.filter(p => {
    if (words.length) {
      const hay = fold(`${p.name} ${p.sku ?? ""}`);
      if (!words.every(w => hay.includes(w))) return false;
    }
    if (f.type && productType(p.name) !== f.type) return false;
    return matchesVariant(p, f.color, f.size);
  });
  const byName = (a: CatalogProduct, b: CatalogProduct) => a.name.localeCompare(b.name, "pt-BR");
  const sorters: Record<CatalogSort, (a: CatalogProduct, b: CatalogProduct) => number> = {
    recent: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || byName(a, b),
    name: byName,
    price_asc: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || byName(a, b),
    price_desc: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity) || byName(a, b),
    stock: (a, b) => b.stock - a.stock || byName(a, b),
  };
  return out.sort(sorters[f.sort]);
}

/** Tamanhos em estoque de um produto, na ordem de grade (para as etiquetas do cartão). */
export function productSizes(p: CatalogProduct): string[] {
  const set = new Map<string, string>();
  for (const v of p.variants) {
    const s = sizeOf(v.attrs);
    if (s && v.stock > 0 && !set.has(fold(s))) set.set(fold(s), s);
  }
  return [...set.values()].sort(compareSizes);
}
