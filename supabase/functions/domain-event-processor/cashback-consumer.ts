// Cashback por pedido: no status gatilho da configuração, o pedido vira um CRÉDITO (cashback_credits) com data de liberação
// (carência configurada na tela). O cupom só é criado na liberação (li-cashback, modo credit_id), depois de conferir
// de novo que o pedido não foi cancelado/devolvido e que o cliente não está na lista de exclusão.
import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { cashbackBase, creditFor, isReversedStatus } from "../_shared/cashback-rules.ts";
import { isExcluded } from "../_shared/cashback-credit.ts";
import type { DomainEvent, LiOrderRow, Outcome } from "./consumers.ts";

type Supabase = ReturnType<typeof createClient>;

/** Pedido mais velho que isto nao dispara cashback (evita premiar pedidos antigos numa importacao ou reimportacao). */
export const CASHBACK_MAX_ORDER_AGE_DAYS = 45;

export async function cashbackConsumer(supabase: Supabase, ev: DomainEvent, order: LiOrderRow | null): Promise<Outcome> {
  if (!order) return { status: "skipped", detail: "pedido nao existe mais" };
  const status = (order.status_name || "").toLowerCase();
  if (!status) return { status: "skipped", detail: "pedido sem status" };
  if (isReversedStatus(status)) return { status: "skipped", detail: "pedido cancelado/devolvido" };

  let q = supabase.from("cashback_configs").select("*").eq("tenant_id", order.tenant_id).eq("is_active", true);
  if (order.integration_id) q = q.eq("integration_id", order.integration_id);
  const { data: config } = await q.limit(1).maybeSingle();
  const triggers = ((config as { trigger_statuses?: string[] } | null)?.trigger_statuses ?? []) as string[];
  if (!config || !triggers.length) return { status: "skipped", detail: "cashback desligado para a loja" };
  if (!triggers.some((s) => s.toLowerCase() === status)) return { status: "skipped", detail: "status nao e gatilho" };

  const cfg = config as Record<string, number | string | boolean | null>;
  const base = cashbackBase(order.totals_json, cfg.base_excludes_shipping as boolean | null);
  if (!base) return { status: "skipped", detail: "pedido sem valor" };
  const ageDays = order.created_at_remote ? (Date.now() - new Date(order.created_at_remote).getTime()) / 86_400_000 : 0;
  if (ageDays > CASHBACK_MAX_ORDER_AGE_DAYS) return { status: "skipped", detail: `pedido com ${Math.floor(ageDays)} dias` };
  const minPurchase = Number(cfg.min_purchase_value ?? 0);
  if (minPurchase > 0 && base < minPurchase) return { status: "skipped", detail: `abaixo do minimo de compra (${minPurchase})` };

  const orderNumber = String(order.order_number);
  const [{ data: existing }, { data: legacy }] = await Promise.all([
    supabase.from("cashback_credits").select("id").eq("tenant_id", order.tenant_id).eq("order_number", orderNumber).maybeSingle(),
    supabase.from("generated_coupons").select("id").eq("tenant_id", order.tenant_id).eq("order_id", orderNumber).eq("origin_type", "cashback").limit(1).maybeSingle(),
  ]);
  if (existing || legacy) return { status: "skipped", detail: "credito/cupom do pedido ja existe" };

  const cli = (order.raw_json?.cliente ?? {}) as Record<string, string | number | null>;
  const email = String(cli.email ?? "") || null;
  const phone = String(cli.telefone_celular || cli.telefone_principal || "") || null;
  const credit = creditFor(base, cfg as unknown as Parameters<typeof creditFor>[1]);
  const delayDays = Math.max(0, Number(cfg.release_delay_days ?? 0));
  const row = {
    tenant_id: order.tenant_id, config_id: cfg.id as string, integration_id: order.integration_id, order_number: orderNumber,
    order_ref: String(order.raw_json?.id ?? order.id), li_customer_id: cli.id != null ? String(cli.id) : null,
    customer_name: (cli.nome as string) || "Cliente", customer_email: email, customer_phone: phone, customer_cpf: (cli.cpf as string) || null,
    base_amount: base, credit_amount: credit, release_at: new Date(Date.now() + delayDays * 86_400_000).toISOString(),
  };

  let skipReason: string | null = null;
  if (!credit) skipReason = "Credito abaixo do minimo configurado";
  else if (await isExcluded(supabase, order.tenant_id, email, phone)) skipReason = "Cliente na lista de exclusao";
  const { data: inserted, error } = await supabase.from("cashback_credits")
    .insert(skipReason ? { ...row, status: "skipped", skip_reason: skipReason } : row).select("id").single();
  if (error) {
    if (error.code === "23505") return { status: "skipped", detail: "credito do pedido ja existe" }; // corrida entre dois eventos
    throw new Error(`cashback_credits: ${error.message}`);
  }
  if (skipReason) return { status: "skipped", detail: skipReason };
  if (delayDays > 0) return { status: "done", detail: `credito pendente ate ${row.release_at}` };

  // sem carência: libera agora (o cron de 15 min é a rede de segurança se esta chamada falhar)
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/li-cashback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ credit_id: (inserted as { id: string }).id }),
  });
  if (!res.ok) console.error(`[cashback] liberacao imediata falhou (${res.status}); o cron tenta de novo`);
  return { status: "done", detail: `cashback do pedido ${orderNumber}` };
}
