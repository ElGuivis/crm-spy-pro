// Regra única de "venda" da Loja Integrada. Espelha public.li_status_is_sale (SQL) e supabase/functions/_shared/order-status.ts.
// Conta como venda tudo que não é cancelado/devolvido/chargeback nem aguardando pagamento: um status novo da loja (ex.: "em separação") não tira a venda dos números.
const NOT_A_SALE = /(cancel|devolvid|chargeback|estorn|reembols|aguardando|an[aá]lise|efetuado|recusad|n[aã]o aprovad)/i;

export function isSaleStatus(status: string | null | undefined): boolean {
  return !!status && !NOT_A_SALE.test(status);
}
