/**
 * ai-chat-context-extras.ts
 * Blocos de contexto da IA que só leem cupons e cashback (sem depender do cliente
 * identificado). Separado de ai-chat-context.ts para respeitar o limite de tamanho.
 */

import { COUPON_COLUMNS } from "./select-columns.ts";

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

export async function buildCouponsInfo(supabase: ServiceClient, tenantId: string, contactPhone: string): Promise<string> {
  const couponNormalizedPhone = contactPhone.replace(/\D/g, '');
  const couponLastNineDigits = couponNormalizedPhone.slice(-9);

  const { data: coupons } = await supabase
    .from('generated_coupons')
    .select(COUPON_COLUMNS)
    .eq('tenant_id', tenantId)
    .ilike('customer_phone', `%${couponLastNineDigits}%`)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(3);

  if (!coupons || coupons.length === 0) return '';

  return `
=== CUPONS ATIVOS DO CLIENTE ===
${coupons.map((c: any) => {
    const expiresDate = new Date(c.expires_at).toLocaleDateString('pt-BR');
    return `- ${c.coupon_code}: ${c.discount_percentage}% de desconto (válido até ${expiresDate})`;
  }).join('\n')}
`;
}

export async function buildCashbackInfo(supabase: ServiceClient, tenantId: string, customerId: string): Promise<string> {
  const { data: cashbackBalance } = await supabase
    .from('cashback_balances')
    .select('id, tenant_id, customer_id, balance, total_earned, total_used, updated_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle();

  if (!cashbackBalance || cashbackBalance.balance <= 0) return '';

  return `
=== 💰 SALDO DE CASHBACK ===
O cliente tem R$ ${cashbackBalance.balance.toFixed(2)} de cashback disponível!
${cashbackBalance.expires_at ? `Válido até: ${new Date(cashbackBalance.expires_at).toLocaleDateString('pt-BR')}` : ''}

💡 Lembre o cliente que ele pode usar esse saldo na próxima compra!
`;
}
