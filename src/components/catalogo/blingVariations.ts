/** Linha de bling_products reduzida ao que serve para ligar variação ↔ pai e ler o estoque. */
export interface BlingChildRow {
  bling_id: number;
  produto_pai_id: number | null;
  nome: string | null;
  estoque_atual: number | null;
}

/**
 * Variações do Bling por pai (chave = bling_id do pai), lidas das LINHAS das variações (23/11/2026).
 * O estoque que o aviso do Bling e o job de 3 min atualizam é o dessas linhas; o JSON `variacoes` do pai só
 * muda na carga completa, então ler dele oferecia tamanho já vendido. A ligação vale por `produto_pai_id` OU
 * pelo id listado no JSON do pai (variação que ainda não foi ligada pela carga de detalhes).
 * Devolve também os ids que são variação: essas linhas não podem aparecer como produto próprio.
 */
export function linkBlingVariations(
  parents: { bling_id?: number | null; variacoes?: unknown }[],
  rows: BlingChildRow[],
): { kids: Map<number, BlingChildRow[]>; variantIds: Set<number> } {
  const byId = new Map(rows.map(r => [Number(r.bling_id), r]));
  const kids = new Map<number, BlingChildRow[]>();
  const variantIds = new Set<number>();
  const add = (pid: number, r: BlingChildRow) => {
    const list = kids.get(pid) ?? [];
    if (!list.some(k => Number(k.bling_id) === Number(r.bling_id))) list.push(r);
    kids.set(pid, list);
    variantIds.add(Number(r.bling_id));
  };
  for (const r of rows) if (r.produto_pai_id != null) add(Number(r.produto_pai_id), r);
  for (const p of parents) {
    if (p.bling_id == null || !Array.isArray(p.variacoes)) continue;
    for (const v of p.variacoes as { id?: number | string }[]) {
      const r = v?.id != null ? byId.get(Number(v.id)) : undefined;
      if (r && Number(r.bling_id) !== Number(p.bling_id)) add(Number(p.bling_id), r);
    }
  }
  return { kids, variantIds };
}

/** Estoque somado das variações (negativo conta como 0). */
export const childrenStock = (kids: BlingChildRow[] | undefined) =>
  (kids ?? []).reduce((s, k) => s + Math.max(Number(k.estoque_atual) || 0, 0), 0);
