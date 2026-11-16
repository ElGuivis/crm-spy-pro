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
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const key = part.slice(0, i).trim().split(/\s+/).pop() ?? "";
    const val = part.slice(i + 1).trim();
    if (key && val) out[key] = val;
  }
  return out;
}

export const variantLabel = (attrs: Record<string, string>) => Object.values(attrs).join(" · ");

export const formatCatalogCurrency = (value: number | null) => {
  if (!value) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

/** Miniatura da CDN da loja (380x380) para a grade de escolha; outras origens ficam como estão. */
export function thumbUrl(url: string): string {
  const m = url.match(/^(https?:\/\/cdn\.awsli\.com\.br)\/(?!\d+x\d+\/)(.+)$/i);
  return m ? `${m[1]}/380x380/${m[2]}` : url;
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

export function normalizeBlingProducts(blingProducts: BlingProductRow[]): CatalogProduct[] {
  return blingProducts.map(p => {
    const imagens = p.imagens as Array<{ link: string }> | null;
    const variacoes = p.variacoes as Array<{ nome?: string; estoque?: { saldoVirtualTotal?: number } }> | null;
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
