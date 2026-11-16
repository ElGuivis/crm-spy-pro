import { Badge } from "@/components/ui/badge";
import type { CatalogProduct } from "./catalogoHelpers";
import { productSizes } from "./catalogFilters";

/** Tamanhos em estoque (P M G...) e aviso de produto fora do site, no rodapé do cartão. */
export function CatalogCardBits({ product, compact }: { product: CatalogProduct; compact?: boolean }) {
  const sizes = productSizes(product);
  const max = compact ? 5 : 7;
  const chip = compact ? "text-[9px] px-1 py-0 leading-4" : "text-[10px] px-1 py-0";
  if (!sizes.length && product.onSite) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-0.5">
      {!product.onSite && <Badge variant="outline" className={`${chip} border-amber-500 text-amber-600`} title="Desativado na loja: não aparece no site">Fora do site</Badge>}
      {sizes.slice(0, max).map(s => <Badge key={s} variant="outline" className={chip}>{s}</Badge>)}
      {sizes.length > max && <Badge variant="outline" className={chip}>+{sizes.length - max}</Badge>}
    </div>
  );
}
