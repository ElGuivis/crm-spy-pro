// Notificação de status do pedido: comparação de status, montagem do texto e código de rastreio.
// Puro (sem consultar o banco) exceto `lookupTracking`; o enfileiramento fica em order-notifications.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type Supabase = ReturnType<typeof createClient>;

/** Compara status sem depender de acento, caixa ou espaço duplo ("Pedido em separação" = "pedido em separacao"). */
export const normStatus = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const CODE_RE = /\{\{(rastreamento|tracking_code)\}\}/g;
const LINK_RE = /\{\{link_rastreio\}\}/g;
export const usesTracking = (text: string): boolean => /\{\{(rastreamento|tracking_code|link_rastreio)\}\}/.test(text);

export const TRACKING_FALLBACK = "ainda em preparação (você recebe o código assim que ele sair)";
export const TRACKING_LINK_FALLBACK = "disponível assim que o código sair";
/** Página pública de acompanhamento (o mesmo endereço que as regras já citavam). */
export const trackingUrl = (code: string) => `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(code)}`;

export interface RenderVars {
  firstName: string; name: string; orderNumber: string; status: string; total: string; products: string;
  /** null = ainda sem código: o marcador fica no texto e é preenchido na hora do envio (applyTracking). */
  tracking: string | null;
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Troca os marcadores {{...}} (e os antigos em inglês). `html: true` protege nomes e produtos contra HTML e quebra linha em <br>. */
export function renderTemplate(tpl: string, v: RenderVars, html = false): string {
  const put = (s: string) => (html ? escapeHtml(s) : s);
  const products = html ? escapeHtml(v.products).replace(/\n/g, "<br>") : v.products;
  let out = tpl
    .replace(/\{\{cliente_primeiro_nome\}\}/g, put(v.firstName))
    .replace(/\{\{(cliente_nome|customer_name)\}\}/g, put(v.name))
    .replace(/\{\{(numero_pedido|order_number)\}\}/g, put(v.orderNumber))
    .replace(/\{\{status\}\}/g, put(v.status))
    .replace(/\{\{valor_total\}\}/g, put(v.total))
    .replace(/\{\{produtos\}\}/g, products || "—");
  if (v.tracking != null) out = out.replace(CODE_RE, put(v.tracking)).replace(LINK_RE, put(trackingUrl(v.tracking)));
  return out;
}

/** Preenche o rastreio que faltava no enfileiramento (usado pelo processador de fila na hora de enviar). code null = texto neutro. */
export function applyTracking(text: string | null | undefined, code: string | null): string {
  return (text ?? "").replace(CODE_RE, code ?? TRACKING_FALLBACK).replace(LINK_RE, code ? trackingUrl(code) : TRACKING_LINK_FALLBACK);
}

const pick = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

/** Código de rastreio de um pedido já carregado (cliente, linha de li_orders ou resposta da API). */
export function trackingFromOrder(...sources: Array<Record<string, unknown> | null | undefined>): string {
  for (const s of sources) {
    if (!s) continue;
    const raw = typeof s.raw_json === "string" ? safeJson(s.raw_json) : (s.raw_json as Record<string, unknown> | null);
    const ship = typeof s.shipping_json === "string" ? safeJson(s.shipping_json) : (s.shipping_json as Record<string, unknown> | null);
    const envios = Array.isArray(s.envios) ? (s.envios[0] as Record<string, unknown> | undefined) : undefined;
    const code = pick(s.codigo_rastreio) || pick(ship?.tracking_code) || pick(raw?.codigo_rastreio)
      || pick(envios?.codigo_rastreamento) || pick(envios?.objeto) || pick(envios?.rastreamento);
    if (code) return code;
  }
  return "";
}

function safeJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; }
}

/** Procura o rastreio no banco: pedido da loja e, por último, as etiquetas do Melhor Envio. */
export async function lookupTracking(supabase: Supabase, orderRowId: string): Promise<string> {
  const { data: order } = await supabase.from("li_orders").select("raw_json, shipping_json").eq("id", orderRowId).maybeSingle();
  const fromOrder = trackingFromOrder(order as Record<string, unknown> | null);
  if (fromOrder) return fromOrder;
  const { data: ship } = await supabase.from("me_shipments").select("tracking_code").eq("li_order_id", orderRowId).not("tracking_code", "is", null).limit(1).maybeSingle();
  return pick((ship as { tracking_code?: string } | null)?.tracking_code);
}
