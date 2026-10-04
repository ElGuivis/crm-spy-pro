import { SALES_TEMPLATES } from "./sales";
import { RELATIONSHIP_TEMPLATES } from "./relationship";
import { SEASONAL_TEMPLATES } from "./seasonal";
import { EDITORIAL_TEMPLATES } from "./editorial";
import type { ProductCard, TemplateCategory } from "./kit";

export * from "./kit";

export const READY_TEMPLATES = [...SALES_TEMPLATES, ...RELATIONSHIP_TEMPLATES, ...SEASONAL_TEMPLATES, ...EDITORIAL_TEMPLATES];

export const CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "vendas", label: "Vendas" },
  { id: "relacionamento", label: "Relacionamento" },
  { id: "datas", label: "Datas especiais" },
  { id: "conteudo", label: "Conteúdo" },
];

const brl = (v: number | null) => (v ? `R$ ${v.toFixed(2).replace(".", ",")}` : "");

export interface ShowcaseRow {
  name: string; price: number; promotional_price: number | null;
  image_path: string | null; image_large: string | null; image_url: string | null; url: string | null;
}

/** Linha da vitrine (RPC) -> cartão de produto do modelo. `imageOf` escolhe a melhor imagem; `linkOf` monta o link da loja. */
export function rowsToCards(rows: ShowcaseRow[], imageOf: (r: ShowcaseRow) => string, linkOf: (path: string | null) => string): ProductCard[] {
  return rows.map((p) => {
    const onSale = !!p.promotional_price && p.promotional_price > 0 && p.promotional_price < p.price;
    return { name: p.name, imageUrl: imageOf(p), price: brl(onSale ? p.promotional_price : p.price), oldPrice: onSale ? brl(p.price) : undefined, url: linkOf(p.url) };
  });
}
