import { bestLiImageUrl, hdImageUrl } from "@/lib/product-images";

/** Quantas fotos de um mesmo produto podem ir numa só remessa (igual a supabase/functions/_shared/catalog-images.ts). */
export const MAX_CATALOG_PHOTOS = 3;
export interface CatalogProduct {
  id: string;
  name: string;
  price: number | null;
  stock: number;
  imageUrl: string | null;
  /** todas as fotos do produto (a principal primeiro, no máximo 10), em boa qualidade */
  images: string[];
  /** fotos escolhidas para enviar (na ordem do envio); sem escolha vale a principal */
  sendImages?: string[];
  sku: string | null;
  variations: string[];
  parsedAttributes: Record<string, string[]>;
  source: "li" | "bling";
}

/** Parse variation strings like "Tamanho:M;Cor:Preto" into { Tamanho: ["M"], Cor: ["Preto"] } */
export function parseVariationAttributes(variations: string[]): Record<string, string[]> {
  const attrs: Record<string, string[]> = {};
  for (const v of variations) {
    for (const part of v.split(";")) {
      const [key, val] = part.split(":").map(s => s.trim());
      if (key && val) {
        if (!attrs[key]) attrs[key] = [];
        if (!attrs[key].includes(val)) attrs[key].push(val);
      }
    }
  }
  return attrs;
}

export const getProductType = (name: string): string => {
  const firstWord = name.trim().split(/\s+/)[0];
  return firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase() : "";
};

export const formatCatalogCurrency = (value: number | null) => {
  if (!value) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

export function normalizeBlingProducts(blingProducts: any[]): CatalogProduct[] {
  return blingProducts.map(p => {
    const imagens = p.imagens as Array<{ link: string }> | null;
    const variacoes = p.variacoes as Array<{ nome?: string; estoque?: { saldoVirtualTotal?: number } }> | null;
    const variationNames = variacoes?.map(v => v.nome || "").filter(Boolean) || [];
    const inlineStock = variacoes?.reduce((sum, v) => sum + (v.estoque?.saldoVirtualTotal || 0), 0) || 0;
    return {
      id: p.id,
      name: p.nome,
      price: p.preco,
      stock: (p.estoque_atual || 0) + inlineStock,
      imageUrl: (imagens && imagens[0]?.link) || p.imagem_url || null,
      images: [...new Set([(imagens && imagens[0]?.link) || p.imagem_url, ...(imagens ?? []).map(i => i?.link)].filter((u): u is string => !!u))].slice(0, 10),
      sku: p.codigo,
      variations: variationNames,
      parsedAttributes: parseVariationAttributes(variationNames),
      source: "bling" as const,
    };
  });
}

const liImageUrl = bestLiImageUrl;

/** Miniatura da CDN da loja (380x380) para a grade de escolha; outras origens ficam como estão. */
export function thumbUrl(url: string): string {
  const m = url.match(/^(https?:\/\/cdn\.awsli\.com\.br)\/(?!\d+x\d+\/)(.+)$/i);
  return m ? `${m[1]}/380x380/${m[2]}` : url;
}

/** LI: principal primeiro e depois as demais fotos do produto na ordem da loja (sem repetir). */
export function liImageList(raw: any, fallback: string | null | undefined): string[] {
  const out: string[] = [];
  const add = (u: string | null | undefined) => { if (u && !out.includes(u)) out.push(u); };
  add(liImageUrl(raw, fallback));
  const list: any[] = Array.isArray(raw?.imagens) ? [...raw.imagens] : [];
  list.sort((a, b) => Number(a?.posicao ?? 0) - Number(b?.posicao ?? 0));
  for (const im of list) add(im?.caminho ? `https://cdn.awsli.com.br/${im.caminho}` : hdImageUrl(im?.grande));
  return out.slice(0, 10);
}

export function normalizeLiProducts(liProducts: any[]): CatalogProduct[] {
  const parents = liProducts.filter(p => {
    const tipo = (p.raw_json as any)?.tipo;
    return tipo === "atributo" || tipo === "simples" || !tipo;
  });
  const children = liProducts.filter(p => (p.raw_json as any)?.tipo === "atributo_opcao");

  const childrenByParentLiId = new Map<number, typeof children>();
  for (const child of children) {
    const paiUrl = (child.raw_json as any)?.pai as string | null;
    const match = paiUrl?.match(/\/produto\/(\d+)$/);
    if (match) {
      const parentLiId = parseInt(match[1], 10);
      if (!childrenByParentLiId.has(parentLiId)) childrenByParentLiId.set(parentLiId, []);
      childrenByParentLiId.get(parentLiId)!.push(child);
    }
  }

  const aggregatedChildIds = new Set<string>();

  const parentProducts: CatalogProduct[] = parents.map(p => {
    const raw = p.raw_json as any | null;
    const liId = p.loja_integrada_product_id;
    const myChildren = liId ? (childrenByParentLiId.get(liId) || []) : [];
    myChildren.forEach(c => aggregatedChildIds.add(c.id));

    const childrenStock = myChildren.reduce((sum, c) => {
      const cStock = (c.raw_json as any)?.estoque_quantidade;
      return sum + (typeof cStock === "number" ? Math.max(cStock, 0) : Math.max(c.stock || 0, 0));
    }, 0);
    const ownStock = typeof raw?.estoque_quantidade === "number" ? Math.max(raw.estoque_quantidade, 0) : Math.max(p.stock || 0, 0);
    const totalStock = myChildren.length > 0 ? childrenStock : ownStock;

    const variationNames: string[] = [];
    for (const child of myChildren) {
      const cStock = (child.raw_json as any)?.estoque_quantidade;
      if (typeof cStock === "number" && cStock > 0) {
        const suffix = (child.name || "").replace(p.name || "", "").trim();
        if (suffix) variationNames.push(suffix);
      }
    }

    return {
      id: p.id,
      name: p.name,
      price: (p.promotional_price as number) || p.price,
      stock: totalStock,
      imageUrl: liImageUrl(raw, p.image_url),
      images: liImageList(raw, p.image_url),
      sku: p.sku,
      variations: variationNames,
      parsedAttributes: parseVariationAttributes(variationNames),
      source: "li" as const,
    };
  });

  const standaloneChildren: CatalogProduct[] = children
    .filter(c => !aggregatedChildIds.has(c.id))
    .map(p => {
      const raw = p.raw_json as any | null;
      const rawStock = raw?.estoque_quantidade;
      const stock = typeof rawStock === "number" ? Math.max(rawStock, 0) : Math.max(p.stock || 0, 0);
      return {
        id: p.id,
        name: p.name,
        price: (p.promotional_price as number) || p.price,
        stock,
        imageUrl: liImageUrl(raw, p.image_url),
        images: liImageList(raw, p.image_url),
        sku: p.sku,
        variations: [] as string[],
        parsedAttributes: {},
        source: "li" as const,
      };
    });

  return [...parentProducts, ...standaloneChildren];
}

const COLOR_KEYS = ["Cor", "cor", "Color", "color"];
const SIZE_KEYS = ["Tamanho", "tamanho", "Size", "size"];

export function buildFilterOptions(products: CatalogProduct[]) {
  const colors = new Set<string>();
  const sizes = new Set<string>();
  const productTypes = new Set<string>();
  products.forEach(p => {
    for (const [key, vals] of Object.entries(p.parsedAttributes)) {
      if (COLOR_KEYS.includes(key)) vals.forEach(v => colors.add(v));
      else if (SIZE_KEYS.includes(key)) vals.forEach(v => sizes.add(v));
    }
    const type = getProductType(p.name);
    if (type) productTypes.add(type);
  });
  return {
    colors: Array.from(colors).sort(),
    sizes: Array.from(sizes).sort(),
    productTypes: Array.from(productTypes).sort(),
  };
}

interface FilterState {
  onlyInStock: boolean;
  searchQuery: string;
  colorFilter: string;
  sizeFilter: string;
  categoryFilter: string;
}

export function filterCatalogProducts(products: CatalogProduct[], f: FilterState): CatalogProduct[] {
  return products.filter(p => {
    if (f.onlyInStock && p.stock <= 0) return false;
    if (f.searchQuery && !p.name.toLowerCase().includes(f.searchQuery.toLowerCase()) && !(p.sku && p.sku.toLowerCase().includes(f.searchQuery.toLowerCase()))) return false;
    if (!p.imageUrl) return false;

    if (f.colorFilter && f.colorFilter !== "all") {
      const productColors = Object.entries(p.parsedAttributes).filter(([k]) => COLOR_KEYS.includes(k)).flatMap(([, v]) => v);
      if (!productColors.includes(f.colorFilter)) return false;
    }
    if (f.sizeFilter && f.sizeFilter !== "all") {
      const productSizes = Object.entries(p.parsedAttributes).filter(([k]) => SIZE_KEYS.includes(k)).flatMap(([, v]) => v);
      if (!productSizes.includes(f.sizeFilter)) return false;
    }
    if (f.categoryFilter && f.categoryFilter !== "all") {
      if (getProductType(p.name) !== f.categoryFilter) return false;
    }
    return true;
  });
}
