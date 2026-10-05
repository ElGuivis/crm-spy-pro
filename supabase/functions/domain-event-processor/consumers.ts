import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type Supabase = ReturnType<typeof createClient>;

export interface DomainEvent {
  id: string; tenant_id: string; event_type: string; ref_id: string;
  payload: { order_number?: string; status_name?: string | null; prev_status_name?: string | null; is_new?: boolean; integration_id?: string | null };
  created_at: string; attempts: number;
}

/** Resultado de um consumidor: 'done' (agiu) ou 'skipped' (nao se aplica, com o motivo). Erro = lancar excecao (o evento volta para a fila). */
export interface Outcome { status: "done" | "skipped"; detail?: string }

/** Pedido mais velho que isto nao dispara cashback (evita premiar pedidos antigos numa importacao ou reimportacao). */
export const CASHBACK_MAX_ORDER_AGE_DAYS = 45;

interface LiOrderRow {
  id: string; order_number: string; status_name: string | null; integration_id: string | null; tenant_id: string;
  created_at_remote: string | null; totals_json: { total?: number | null } | null; raw_json: Record<string, unknown> | null;
}

async function loadOrder(supabase: Supabase, ev: DomainEvent): Promise<LiOrderRow | null> {
  const { data } = await supabase.from("li_orders")
    .select("id, order_number, status_name, integration_id, tenant_id, created_at_remote, totals_json, raw_json")
    .eq("id", ev.ref_id).maybeSingle();
  return (data as LiOrderRow | null) ?? null;
}

/**
 * Cashback: se o status do pedido esta entre os gatilhos da configuracao ativa da loja, chama li-cashback (uma vez por pedido).
 * Substitui os tres disparos que existiam na sincronizacao, na checagem de status e no webhook.
 */
export async function cashbackConsumer(supabase: Supabase, ev: DomainEvent): Promise<Outcome> {
  const order = await loadOrder(supabase, ev);
  if (!order) return { status: "skipped", detail: "pedido nao existe mais" };
  const status = (order.status_name || "").toLowerCase();
  if (!status) return { status: "skipped", detail: "pedido sem status" };

  let q = supabase.from("cashback_configs").select("trigger_statuses").eq("tenant_id", order.tenant_id).eq("is_active", true);
  if (order.integration_id) q = q.eq("integration_id", order.integration_id);
  const { data: config } = await q.limit(1).maybeSingle();
  const triggers = (config?.trigger_statuses ?? []) as string[];
  if (!triggers.length) return { status: "skipped", detail: "cashback desligado para a loja" };
  if (!triggers.some((s) => s.toLowerCase() === status)) return { status: "skipped", detail: "status nao e gatilho" };

  const total = Number(order.totals_json?.total ?? 0);
  if (!total) return { status: "skipped", detail: "pedido sem valor" };
  const ageDays = order.created_at_remote ? (Date.now() - new Date(order.created_at_remote).getTime()) / 86_400_000 : 0;
  if (ageDays > CASHBACK_MAX_ORDER_AGE_DAYS) return { status: "skipped", detail: `pedido com ${Math.floor(ageDays)} dias` };

  const { data: existing } = await supabase.from("generated_coupons").select("id").eq("tenant_id", order.tenant_id).eq("order_id", String(order.order_number)).limit(1).maybeSingle();
  if (existing) return { status: "skipped", detail: "cupom do pedido ja existe" };

  const cli = (order.raw_json?.cliente ?? {}) as Record<string, string | null>;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/li-cashback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({
      order_id: order.raw_json?.id ?? order.id, order_number: String(order.order_number),
      customer_name: cli.nome || "Cliente", customer_email: cli.email || "",
      customer_phone: cli.telefone_celular || cli.telefone_principal || "", customer_cpf: cli.cpf || "",
      order_total: total, tenant_id: order.tenant_id, integration_id: order.integration_id,
    }),
  });
  if (!res.ok) throw new Error(`li-cashback respondeu ${res.status}`);
  return { status: "done", detail: `cashback do pedido ${order.order_number}` };
}

/** Consumidores por loja (rodam uma vez por loja em cada lote, nao uma vez por evento): quem comprou sai dos fluxos de recuperacao e a atribuicao das campanhas atualiza na hora. */
export async function recoveryConsumer(supabase: Supabase): Promise<void> {
  const { error } = await supabase.rpc("refresh_abandonment_recovery");
  if (error) throw new Error(`recuperacao: ${error.message}`);
}

export async function attributionConsumer(supabase: Supabase, tenantId: string): Promise<void> {
  const { error } = await supabase.rpc("refresh_email_campaign_attribution", { p_tenant_id: tenantId });
  if (error) throw new Error(`atribuicao: ${error.message}`);
}
