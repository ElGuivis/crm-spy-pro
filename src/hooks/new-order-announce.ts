// Regras do aviso de "Novo pedido" (sem React, fáceis de testar).

export interface AnnouncedOrderRow {
  id: string;
  order_number?: string | number | null;
  loja_integrada_order_id?: string | number | null;
  created_at_remote?: string | null;
  raw_json?: { cliente_nome?: string; cliente?: { nome?: string } } | null;
  totals_json?: { total?: number } | null;
}

/** Janela em que um pedido ainda conta como "novo". Pedidos mais antigos chegam pela sincronização do histórico. */
export const RECENT_ORDER_WINDOW_MS = 30 * 60 * 1000;

export function isRecentOrder(order: AnnouncedOrderRow, now = Date.now()): boolean {
  if (!order.created_at_remote) return false;
  const created = Date.parse(order.created_at_remote);
  return Number.isFinite(created) && now - created >= 0 && now - created <= RECENT_ORDER_WINDOW_MS;
}

export function orderNumberOf(order: AnnouncedOrderRow): string | null {
  const n = order.order_number ?? order.loja_integrada_order_id;
  return n === null || n === undefined || n === '' ? null : String(n);
}

export function customerNameOf(order: AnnouncedOrderRow): string {
  return order.raw_json?.cliente_nome?.trim() || order.raw_json?.cliente?.nome?.trim() || 'Cliente';
}

/** Um pedido recém-inserido pode vir sem número/data (a sincronização preenche logo depois): vale reler antes de avisar. */
export function isIncompleteOrder(order: AnnouncedOrderRow): boolean {
  return orderNumberOf(order) === null || !order.created_at_remote;
}
