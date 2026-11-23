/**
 * Canais de venda do Bling escolhidos por integração (22/11/2026).
 *
 * - `integrations.bling_store_ids`: canais cujos PEDIDOS entram. NULL/vazio = todos.
 *   O id 0 (NO_CHANNEL) = pedidos sem canal (lançados à mão: `loja.id` 0 ou ausente).
 * - `integrations.bling_product_store_id`: canal cujos PRODUTOS vinculados entram. NULL = todos.
 *
 * A API filtra pedidos por `idLoja`, mas IGNORA `idLoja=0` (devolve tudo): quando "sem canal" está
 * na escolha, a lista vem inteira e o filtro é feito aqui (`orderInChannels`).
 */

export const NO_CHANNEL = 0;

export interface BlingChannelScope {
  /** null = todos os pedidos */
  orderStoreIds: number[] | null;
  /** null = todos os produtos */
  productStoreId: number | null;
}

type Db = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
};

function toIdList(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const ids = v.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0);
  return ids.length ? [...new Set(ids)] : null;
}

export function parseChannelScope(row: Record<string, unknown> | null | undefined): BlingChannelScope {
  const p = Number(row?.bling_product_store_id);
  return {
    orderStoreIds: toIdList(row?.bling_store_ids),
    productStoreId: Number.isInteger(p) && p > 0 ? p : null,
  };
}

export async function loadChannelScope(supabase: unknown, integrationId: string): Promise<BlingChannelScope> {
  const { data } = await (supabase as Db)
    .from("integrations")
    .select("bling_store_ids, bling_product_store_id")
    .eq("id", integrationId)
    .maybeSingle();
  return parseChannelScope(data);
}

/** Canal do pedido (0 quando não tem). */
export function orderChannelId(order: Record<string, unknown>): number {
  const id = Number((order.loja as Record<string, unknown> | undefined)?.id);
  return Number.isFinite(id) && id > 0 ? id : NO_CHANNEL;
}

export function orderInChannels(order: Record<string, unknown>, storeIds: number[] | null): boolean {
  if (!storeIds || storeIds.length === 0) return true;
  return storeIds.includes(orderChannelId(order));
}

/**
 * Consultas de listagem de pedidos: uma por canal (o Bling filtra) ou uma só sem filtro
 * (todos, ou quando "sem canal" foi escolhido — aí o filtro é local).
 */
export function orderListQueries(storeIds: number[] | null): Array<Record<string, string>> {
  if (!storeIds || storeIds.length === 0 || storeIds.includes(NO_CHANNEL)) return [{}];
  return storeIds.map((id) => ({ idLoja: String(id) }));
}

/** Parâmetro de listagem de produtos ({} = todos). */
export function productListParams(productStoreId: number | null): Record<string, string> {
  return productStoreId ? { idLoja: String(productStoreId) } : {};
}
