import type { BlingChildRow } from "./blingVariations";

/** Campos do `raw_json` da Loja Integrada lidos fora do catálogo (ex.: NotificationDropdown). */
export interface LiProductRaw {
  tipo?: string;
  pai?: string | null;
  estoque_quantidade?: number;
  imagem_principal?: { caminho?: string | null; grande?: string | null } | null;
  imagens?: { caminho?: string | null; grande?: string | null; posicao?: number }[];
}

/** Linha da RPC `get_catalog_products` (produto da Loja Integrada já agrupado com as variações em estoque). */
export interface LiCatalogRow {
  id: string;
  name: string | null;
  price: number | null;
  stock: number | null;
  on_site: boolean | null;
  sku: string | null;
  images: string[] | null;
  created_at: string | null;
  variants: unknown;
}

/** Linha de `bling_products` como o catálogo a consulta. */
export interface BlingProductRow {
  id: string;
  bling_id?: number | null;
  nome: string;
  preco: number | null;
  estoque_atual: number | null;
  imagem_url: string | null;
  imagens: unknown;
  codigo: string | null;
  variacoes: unknown;
  created_at?: string | null;
}

/** Quantas fotos de um mesmo produto podem ir numa só remessa (igual a supabase/functions/_shared/catalog-images.ts). */
export const MAX_CATALOG_PHOTOS = 3;

/** Variação com estoque: atributos nomeados ({ Tamanho: "M", Cor: "Preto" }). */
export interface CatalogVariant {
  attrs: Record<string, string>;
  stock: number;
}

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
  /** rótulos das variações em estoque ("M · Preto"), enviados junto ao produto */
  variations: string[];
  variants: CatalogVariant[];
  /** false = produto desativado na loja (não aparece no site), mas ainda com estoque */
  onSite: boolean;
  createdAt: string | null;
  source: "li" | "bling";
}

/** "Tamanho:M;Cor:Preto" -> { Tamanho: "M", Cor: "Preto" } */
export function parseVariationString(v: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of v.split(";")) {
    // último "chave:valor" da parte: o nome do produto vem antes e pode ter ":" ("Colab: Dexter Tamanho:M")
    const m = part.match(/([^\s:]+):([^:]*)$/);
    if (!m) continue;
    const key = m[1].trim(), val = m[2].trim();
    if (key && val) out[key] = val;
  }
  return out;
}

export const variantLabel = (attrs: Record<string, string>) => Object.values(attrs).join(" · ");

export const formatCatalogCurrency = (value: number | null) => {
  if (!value) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

/**
 * Miniatura para grades: CDN da Loja Integrada (380x380) ou nosso Storage (foto do Bling copiada,
 * reduzida na hora pelo imgproxy do servidor). Outras origens ficam como estão.
 */
export function thumbUrl(url: string, size = 500): string {
  const li = url.match(/^(https?:\/\/cdn\.awsli\.com\.br)\/(?!\d+x\d+\/)(.+)$/i);
  if (li) return `${li[1]}/380x380/${li[2]}`;
  if (url.includes("/storage/v1/object/public/") && !url.includes("?")) {
    return `${url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")}?width=${size}&height=${size}&resize=contain&quality=80`;
  }
  return url;
}

export function normalizeLiCatalogRows(rows: LiCatalogRow[]): CatalogProduct[] {
  return rows.map(r => {
    const name = r.name ?? "";
    const rawVariants = Array.isArray(r.variants) ? r.variants as { name?: string; attrs?: Record<string, string>; stock?: number }[] : [];
    const variants: CatalogVariant[] = rawVariants.map(v => {
      // nomes vêm do mapa de grades; sem ele, do sufixo do nome da variação ("<nome do pai> Tamanho:M;Cor:Preto")
      const attrs = v.attrs && Object.keys(v.attrs).length ? v.attrs : parseVariationString((v.name ?? "").replace(name, ""));
      return { attrs, stock: Number(v.stock) || 0 };
    });
    const images = (r.images ?? []).filter(Boolean);
    return {
      id: r.id,
      name,
      price: r.price == null ? null : Number(r.price),
      stock: Number(r.stock) || 0,
      imageUrl: images[0] ?? null,
      images,
      sku: r.sku,
      variations: variants.map(v => variantLabel(v.attrs)).filter(Boolean),
      variants,
      onSite: r.on_site !== false,
      createdAt: r.created_at,
      source: "li" as const,
    };
  });
}

/**
 * `kids` = linhas das variações por bling_id do pai (`fetchBlingChildren`). Quando o pai tem linhas, estoque,
 * tamanho e cor vêm delas (são as que o Bling atualiza a cada venda); o JSON `variacoes` do pai só vale sem elas.
 */
export function normalizeBlingProducts(blingProducts: BlingProductRow[], kids?: Map<number, BlingChildRow[]>): CatalogProduct[] {
  return blingProducts.map(p => {
    const imagens = p.imagens as Array<{ link: string }> | null;
    const rows = p.bling_id != null ? kids?.get(Number(p.bling_id)) : undefined;
    const variacoes = rows?.length
      ? rows.map(k => ({ nome: k.nome ?? "", estoque: { saldoVirtualTotal: Number(k.estoque_atual) || 0 } }))
      : p.variacoes as Array<{ nome?: string; estoque?: { saldoVirtualTotal?: number } }> | null;
    const variants: CatalogVariant[] = (variacoes ?? [])
      .map(v => ({ attrs: parseVariationString(v.nome || ""), stock: Math.max(v.estoque?.saldoVirtualTotal || 0, 0) }))
      .filter(v => v.stock > 0 && Object.keys(v.attrs).length > 0);
    const inlineStock = variacoes?.reduce((sum, v) => sum + Math.max(v.estoque?.saldoVirtualTotal || 0, 0), 0) || 0;
    const first = (imagens && imagens[0]?.link) || p.imagem_url || null;
    return {
      id: p.id,
      name: p.nome,
      price: p.preco,
      stock: Math.max(p.estoque_atual || 0, 0) + inlineStock,
      imageUrl: first,
      images: [...new Set([first, ...(imagens ?? []).map(i => i?.link)].filter((u): u is string => !!u))].slice(0, 10),
      sku: p.codigo,
      variations: variants.map(v => variantLabel(v.attrs)),
      variants,
      onSite: true,
      createdAt: p.created_at ?? null,
      source: "bling" as const,
    };
  });
}
