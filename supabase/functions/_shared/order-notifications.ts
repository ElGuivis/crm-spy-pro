// Notificação de status do pedido (WhatsApp/e-mail): chamada quando um pedido entra ou muda de status.
// Regras de segurança: cada (regra, pedido, canal) é reservado no banco ANTES de enfileirar (índice único), então duas execuções
// ao mesmo tempo nunca mandam duas vezes; destinatário bloqueado/suprimido não recebe; rastreio ausente espera em vez de sair "N/A".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
import { canContact, normEmail, normPhone } from "./contact-policy.ts";
import { lookupTracking, normStatus, renderTemplate, trackingFromOrder, usesTracking, type RenderVars } from "./order-notification-render.ts";

const log = createLogger("order-notifications", "shared");
type Supabase = ReturnType<typeof createClient>;
type Row = Record<string, unknown>;

/** Pedido mais velho que isto nunca notifica (evita disparo em massa ao reimportar). */
const MAX_ORDER_AGE_DAYS = 7;
/** Quando o texto usa o rastreio e ele ainda não existe, a 1ª tentativa de envio espera isto (min). */
const TRACKING_FIRST_WAIT_MIN = 10;

interface Config { id: string; whatsapp_integration_id: string | null; email_integration_id: string | null; send_via_whatsapp: boolean | null; send_via_email: boolean | null }
interface Rule { id: string; status_name: string; message_template: string; delay_minutes: number | null; email_subject: string | null; email_body: string | null }
interface Ctx { vars: RenderVars; phone: string | null; email: string | null; orderRowId: string; orderNumber: string; liId: string; tenantId: string }

async function buildContext(supabase: Supabase, apiOrder: Row, dbOrder: Row, statusName: string, tenantId: string): Promise<Ctx> {
  const orderRowId = String(dbOrder.id);
  const api = (apiOrder.cliente && typeof apiOrder.cliente === "object" ? apiOrder.cliente : {}) as Row;
  const name = String(api.nome || dbOrder.cliente_nome || "Cliente");
  const phone = normPhone(String(api.telefone_celular || api.telefone_principal || dbOrder.cliente_telefone || ""));
  const email = normEmail(String(api.email || dbOrder.cliente_email || ""));
  const total = Number(dbOrder.valor_total || apiOrder.valor_total || 0);
  const { data: items } = await supabase.from("li_order_items").select("name, qty, price").eq("order_id", orderRowId);
  const products = ((items ?? []) as Row[]).map((i) =>
    `• ${Number(i.qty) || 1}x ${i.name} - ${(Number(i.price) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join("\n");
  let tracking = trackingFromOrder(dbOrder, apiOrder);
  if (!tracking) tracking = await lookupTracking(supabase, orderRowId);
  const orderNumber = String(dbOrder.numero);
  return {
    phone, email, orderRowId, orderNumber, tenantId, liId: String(apiOrder.id || dbOrder.li_id || ""),
    vars: { firstName: name.split(" ")[0], name, orderNumber, status: statusName, total: total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), products, tracking: tracking || null },
  };
}

/** Reserva (regra, pedido, canal). false = já reservado por outra execução (não enviar de novo). */
async function claim(supabase: Supabase, ctx: Ctx, config: Config, rule: Rule, channel: "whatsapp" | "email", message: string, status: "pending" | "cancelled", reason?: string): Promise<string | null> {
  // Confere antes (funciona mesmo sem o índice único) e reserva com INSERT; o índice único do banco fecha a corrida entre duas execuções.
  const { data: already } = await supabase.from("order_notification_executions").select("id")
    .eq("rule_id", rule.id).eq("order_number", ctx.orderNumber).eq("channel", channel).limit(1);
  if (already?.length) return null;
  const { data, error } = await supabase.from("order_notification_executions").insert({
    tenant_id: ctx.tenantId, config_id: config.id, rule_id: rule.id, order_number: ctx.orderNumber, order_id: ctx.liId, status_name: ctx.vars.status, channel,
    customer_phone: channel === "whatsapp" ? ctx.phone : null, customer_email: channel === "email" ? ctx.email : null,
    message_sent: message, status, error_message: reason ?? null,
  }).select("id").single();
  if (error) {
    if (error.code !== "23505") log.error(`[ORDER-NOTIFICATION] não reservou o envio do pedido #${ctx.orderNumber}:`, error.message);
    return null;
  }
  return (data as { id: string }).id;
}

async function queueChannel(supabase: Supabase, ctx: Ctx, config: Config, rule: Rule, channel: "whatsapp" | "email"): Promise<void> {
  const isWa = channel === "whatsapp";
  const text = renderTemplate(rule.message_template, ctx.vars);
  const emailBodyTpl = rule.email_body || `<p>${rule.message_template.split("\n").join("<br>")}</p>`;
  const subject = renderTemplate(rule.email_subject || `Atualização do Pedido #${ctx.orderNumber}`, ctx.vars);
  const htmlBody = renderTemplate(emailBodyTpl, ctx.vars, true);
  const texts = isWa ? [rule.message_template] : [rule.message_template, emailBodyTpl, rule.email_subject ?? ""];
  const waitsForTracking = texts.some(usesTracking) && !ctx.vars.tracking;

  const recipient = isWa ? ctx.phone : ctx.email;
  if (!recipient) {
    await claim(supabase, ctx, config, rule, channel, text, "cancelled", isWa ? "Cliente sem telefone válido" : "Cliente sem e-mail válido");
    return;
  }
  const decision = await canContact(supabase, ctx.tenantId, isWa ? { phone: recipient } : { email: recipient }, "order_status");
  // Só supressão e bloqueio impedem aviso de pedido; limite diário e prioridade são de marketing e não se aplicam a mensagem transacional.
  if (!decision.ok && decision.permanent) {
    await claim(supabase, ctx, config, rule, channel, text, "cancelled", `Destinatário bloqueado (${decision.reason})`);
    return;
  }

  const executionId = await claim(supabase, ctx, config, rule, channel, text, "pending");
  if (!executionId) return; // já reservado: outra execução cuida

  const delay = Math.max(0, Number(rule.delay_minutes ?? 0));
  const waitMin = waitsForTracking ? Math.max(delay, TRACKING_FIRST_WAIT_MIN) : delay;
  const { error } = await supabase.from("message_queue").insert({
    tenant_id: ctx.tenantId, channel, recipient,
    message_content: text, subject: isWa ? null : subject, html_content: isWa ? null : htmlBody,
    whatsapp_integration_id: isWa ? config.whatsapp_integration_id : null, email_integration_id: isWa ? null : config.email_integration_id,
    reference_type: "order_notification", reference_id: ctx.orderRowId, status: "pending",
    next_retry_at: new Date(Date.now() + waitMin * 60_000).toISOString(),
    metadata: { expected_status: ctx.vars.status, order_number: ctx.orderNumber, delay_minutes: delay, execution_id: executionId, tracking_required: waitsForTracking, tracking_waits: 0 },
  });
  if (error) {
    // não ficou na fila: libera a reserva para uma próxima mudança/sincronização tentar de novo
    log.error(`[ORDER-NOTIFICATION] fila recusou o pedido #${ctx.orderNumber} (${channel}):`, error.message);
    await supabase.from("order_notification_executions").delete().eq("id", executionId);
    return;
  }
  log.info(`[ORDER-NOTIFICATION] ✓ ${channel} do pedido #${ctx.orderNumber} na fila (${rule.status_name}, espera ${waitMin} min)`);
}

/** Pedido entrou ou mudou de status: enfileira as mensagens das regras que combinam com o status. */
export async function processOrderNotificationsInJob(
  supabase: Supabase, apiOrder: Row, dbOrder: Row, statusName: string, tenantId: string, integrationId: string,
): Promise<void> {
  try {
    if (!dbOrder?.id) { log.warn(`[ORDER-NOTIFICATION] pedido #${dbOrder?.numero} sem id: ignorado`); return; }
    const created = (dbOrder.created_at_remote || dbOrder.created_at) as string | undefined;
    if (created && new Date(created).getTime() < Date.now() - MAX_ORDER_AGE_DAYS * 86_400_000) return;

    const { data: configs } = await supabase.from("order_notification_configs")
      .select("id, whatsapp_integration_id, email_integration_id, send_via_whatsapp, send_via_email")
      .eq("tenant_id", tenantId).eq("is_active", true).eq("integration_id", integrationId);
    if (!configs?.length) return;

    const wanted = normStatus(statusName);
    let ctx: Ctx | null = null;
    for (const config of configs as Config[]) {
      const { data: all } = await supabase.from("order_notification_status_rules")
        .select("id, status_name, message_template, delay_minutes, email_subject, email_body").eq("config_id", config.id).eq("is_enabled", true);
      const rules = ((all ?? []) as Rule[]).filter((r) => normStatus(r.status_name) === wanted);
      if (!rules.length) continue;
      ctx ??= await buildContext(supabase, apiOrder, dbOrder, statusName, tenantId);
      for (const rule of rules) {
        if (config.send_via_whatsapp && config.whatsapp_integration_id) await queueChannel(supabase, ctx, config, rule, "whatsapp");
        if (config.send_via_email && config.email_integration_id) await queueChannel(supabase, ctx, config, rule, "email");
      }
    }
  } catch (error) {
    log.error("[ORDER-NOTIFICATION] Error:", error);
  }
}
