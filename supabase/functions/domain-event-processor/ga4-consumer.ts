// GA4: pedido cancelado/devolvido vira um evento `refund` (Measurement Protocol) com o mesmo transaction_id do `purchase`
// que a tag da loja mandou no checkout. Sem isso o GA4 continua contando como venda o PIX que nunca foi pago.
// Limite do GA4: o refund desconta "Receita total" (coluna Reembolso), mas não reduz o número de transações.
import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { isReversedStatus } from "../_shared/cashback-rules.ts";
import type { DomainEvent, LiOrderRow, Outcome } from "./consumers.ts";

type Supabase = ReturnType<typeof createClient>;

/** Pedido mais velho que isto não gera refund: o GA4 pode nem ter recebido o purchase (importação de pedidos antigos). */
export const GA4_MAX_ORDER_AGE_DAYS = 30;
/** Um único client_id fixo: refunds do servidor não inflam a contagem de usuários do GA4. */
const SERVER_CLIENT_ID = "crm-spy-pro.server";
const ENDPOINT = "https://www.google-analytics.com/mp/collect";

export const GA4_CONSUMER = "ga4_refund";

/** Já mandamos refund deste pedido por outro evento (ex.: cancelado e depois devolvido)? Evita descontar duas vezes. */
async function alreadyRefunded(supabase: Supabase, orderId: string): Promise<boolean> {
  const { data: evs } = await supabase.from("domain_events").select("id").eq("ref_id", orderId);
  const ids = ((evs ?? []) as { id: string }[]).map((e) => e.id);
  if (!ids.length) return false;
  const { data } = await supabase.from("domain_event_deliveries").select("event_id")
    .eq("consumer", GA4_CONSUMER).eq("status", "done").in("event_id", ids).limit(1);
  return !!data?.length;
}

export async function ga4RefundConsumer(supabase: Supabase, ev: DomainEvent, order: LiOrderRow | null): Promise<Outcome> {
  const measurementId = Deno.env.get("GA4_MEASUREMENT_ID")?.trim();
  const apiSecret = Deno.env.get("GA4_API_SECRET")?.trim();
  const tenantId = Deno.env.get("GA4_TENANT_ID")?.trim();
  if (!measurementId || !apiSecret || !tenantId) return { status: "skipped", detail: "GA4 nao configurado" };
  if (ev.tenant_id !== tenantId) return { status: "skipped", detail: "loja sem GA4 configurado" };
  if (!order) return { status: "skipped", detail: "pedido nao existe mais" };
  if (!isReversedStatus(order.status_name)) return { status: "skipped", detail: "pedido nao esta cancelado/devolvido" };
  if (isReversedStatus(ev.payload.prev_status_name)) return { status: "skipped", detail: "ja estava cancelado/devolvido" };

  const ageDays = order.created_at_remote ? (Date.now() - new Date(order.created_at_remote).getTime()) / 86_400_000 : 0;
  if (ageDays > GA4_MAX_ORDER_AGE_DAYS) return { status: "skipped", detail: `pedido com ${Math.floor(ageDays)} dias` };
  // O purchase da loja leva o SUBTOTAL dos produtos (sem frete e sem desconto; conferido contra o GA4): o refund tem de ser do mesmo valor.
  const value = Number(order.totals_json?.subtotal ?? 0) || Number(order.totals_json?.total ?? 0);
  if (!(value > 0)) return { status: "skipped", detail: "pedido sem valor" };
  if (await alreadyRefunded(supabase, order.id)) return { status: "skipped", detail: "refund do pedido ja enviado" };

  const res = await fetch(`${ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`, {
    method: "POST",
    body: JSON.stringify({
      client_id: SERVER_CLIENT_ID,
      events: [{ name: "refund", params: { transaction_id: String(order.order_number), value, currency: "BRL" } }],
    }),
  });
  if (!res.ok) throw new Error(`GA4 respondeu ${res.status}`);
  return { status: "done", detail: `refund do pedido ${order.order_number} (R$ ${value.toFixed(2)})` };
}
