/**
 * ai-chat-context-extras.ts
 * Blocos de contexto da IA que só leem catálogo, cupons e cashback (sem depender do cliente
 * identificado). Separado de ai-chat-context.ts para respeitar o limite de tamanho.
 */

import type { StoreIntegrationInfo } from "./ai-chat-store.ts";
import { COUPON_COLUMNS, getStoreColumns } from "./select-columns.ts";

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

/** Generic product row */
export interface ProductRow {
  nome: string;
  preco?: number | null;
  preco_cheio?: number | null;
  preco_promocional?: number | null;
  estoque_quantidade?: number | null;
  estoque_atual?: number | null;
  categoria_nome?: string | null;
  [key: string]: unknown;
}

export async function buildFeaturedProductsInfo(supabase: ServiceClient, storeInfo: StoreIntegrationInfo, tenantId: string): Promise<string> {
  const productsTable = storeInfo.tables.products;
  const isLI = storeInfo.type === 'loja_integrada';

  let query = supabase
    .from(productsTable)
    .select(getStoreColumns(productsTable))
    .eq('tenant_id', tenantId);

  if (isLI) {
    query = query.eq('ativo', true).eq('destaque', true).gt('estoque_quantidade', 0);
  } else {
    query = query.eq('situacao', 'Ativo').gt('estoque_atual', 0);
  }

  const { data: featuredProducts } = await query.limit(10);
  if (!featuredProducts || featuredProducts.length === 0) return '';

  return `
=== PRODUTOS EM DESTAQUE ===
${(featuredProducts as ProductRow[]).map(p => {
    const price = isLI
      ? (p.preco_promocional ? `R$ ${p.preco_promocional.toFixed(2)} (de R$ ${p.preco_cheio?.toFixed(2) || '0,00'})` : `R$ ${p.preco_cheio?.toFixed(2) || '0,00'}`)
      : `R$ ${p.preco?.toFixed(2) || '0,00'}`;
    const stock = isLI ? p.estoque_quantidade : p.estoque_atual;
    return `- ${p.nome}: ${price} | Estoque: ${stock} unid.`;
  }).join('\n')}

💡 Use essas informações para recomendar produtos ao cliente quando apropriado.
`;
}

export async function buildCatalogProductsInfo(supabase: ServiceClient, storeInfo: StoreIntegrationInfo, tenantId: string): Promise<string> {
  const productsTable = storeInfo.tables.products;
  const isLI = storeInfo.type === 'loja_integrada';

  let query = supabase
    .from(productsTable)
    .select(getStoreColumns(productsTable))
    .eq('tenant_id', tenantId);

  if (isLI) {
    query = query.eq('ativo', true).gt('estoque_quantidade', 0);
  } else {
    query = query.eq('situacao', 'Ativo').gt('estoque_atual', 0);
  }

  const { data: allProducts } = await query.limit(30);
  if (!allProducts || allProducts.length === 0) return '';

  return `
=== CATÁLOGO DE PRODUTOS (${allProducts.length} produtos disponíveis) ===
${(allProducts as ProductRow[]).map(p => {
    const price = isLI
      ? (p.preco_promocional ? `R$ ${p.preco_promocional.toFixed(2)}` : `R$ ${p.preco_cheio?.toFixed(2) || '0,00'}`)
      : `R$ ${p.preco?.toFixed(2) || '0,00'}`;
    const category = p.categoria_nome;
    const stock = isLI ? p.estoque_quantidade : p.estoque_atual;
    return `- ${p.nome} (${category || 'Sem categoria'}): ${price} | ${stock} em estoque`;
  }).join('\n')}
`;
}

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
