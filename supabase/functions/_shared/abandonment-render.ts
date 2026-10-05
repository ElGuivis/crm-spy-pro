// Variáveis e blocos do e-mail/WhatsApp de recuperação (carrinho, navegação, pedido abandonado).

export interface CartItem {
  product_id: number | null; quantity: number; name: string | null; variant?: string | null;
  price: number | null; image: string | null; url: string | null;
}

export const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Caminho relativo da loja ("/produto/x.html") → link completo. */
export function absoluteUrl(storeUrl: string, path: string | null | undefined): string {
  if (!path) return storeUrl;
  if (/^https?:\/\//i.test(path)) return path;
  return `${storeUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function cartTotal(items: CartItem[], fallback: number): number {
  const sum = items.reduce((acc, i) => acc + (i.price ?? 0) * i.quantity, 0);
  return sum > 0 ? sum : fallback;
}

/** Lista de itens para o corpo do e-mail: foto, nome, variação, quantidade e preço; cada linha leva ao produto. */
export function cartItemsHtml(items: CartItem[], storeUrl: string, total: number, maxItems = 5): string {
  const shown = items.filter((i) => i.name).slice(0, maxItems);
  if (!shown.length) return "";
  const rows = shown.map((i) => {
    const href = esc(absoluteUrl(storeUrl, i.url));
    const img = i.image
      ? `<a href="${href}" style="text-decoration:none;"><img src="${esc(i.image)}" width="72" height="72" alt="${esc(i.name ?? "Produto")}" style="display:block;width:72px;height:72px;object-fit:cover;border-radius:8px;border:0;background:rgba(128,128,128,.15);"></a>`
      : "";
    const price = i.price ? `<div style="font-size:15px;font-weight:700;color:inherit;white-space:nowrap;">${brl(i.price * i.quantity)}</div>` : "";
    return `<tr>
<td width="84" valign="top" style="padding:10px 12px 10px 0;">${img}</td>
<td valign="top" style="padding:10px 8px 10px 0;font-family:Arial,Helvetica,sans-serif;">
<a href="${href}" style="color:inherit;font-size:15px;font-weight:600;line-height:1.35;text-decoration:none;">${esc(i.name ?? "")}</a>
${i.variant ? `<div style="font-size:13px;color:inherit;opacity:.65;margin-top:2px;">${esc(i.variant)}</div>` : ""}
<div style="font-size:13px;color:inherit;opacity:.65;margin-top:2px;">Qtd: ${i.quantity}</div>
</td>
<td valign="top" align="right" style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;">${price}</td>
</tr>`;
  }).join("");
  const more = items.length > shown.length ? `<tr><td colspan="3" style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:inherit;opacity:.65;">e mais ${items.length - shown.length} item(ns) no carrinho</td></tr>` : "";
  const totalRow = total > 0
    ? `<tr><td colspan="2" style="padding:12px 0 0;border-top:1px solid rgba(128,128,128,.35);font-family:Arial,Helvetica,sans-serif;font-size:14px;color:inherit;">Total do carrinho</td><td align="right" style="padding:12px 0 0;border-top:1px solid rgba(128,128,128,.35);font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:inherit;white-space:nowrap;">${brl(total)}</td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${rows}${more}${totalRow}</table>`;
}

/** Versão em texto (WhatsApp e e-mail em texto puro). */
export function cartItemsText(items: CartItem[], storeUrl: string, maxItems = 5): string {
  return items.filter((i) => i.name).slice(0, maxItems)
    .map((i) => `• ${i.quantity > 1 ? `${i.quantity}x ` : ""}${i.name}${i.variant ? ` (${i.variant})` : ""}${i.price ? ` — ${brl(i.price * i.quantity)}` : ""}`)
    .join("\n") || absoluteUrl(storeUrl, null);
}

export interface CartVars {
  cart_items: string; cart_items_text: string; cart_total: string; cart_count: string;
  cart_url: string; product_name: string; product_image: string; product_url: string; store_url: string;
}

/** Link para voltar ao carrinho: o carrinho da loja vive no navegador da pessoa, então a página de carrinho é o melhor destino. */
export const cartUrl = (storeUrl: string) => `${storeUrl.replace(/\/$/, "")}/carrinho/index`;

export function buildCartVars(items: CartItem[], value: number, storeUrl: string): CartVars {
  const first = items.find((i) => i.name);
  const total = cartTotal(items, value);
  const count = items.reduce((a, i) => a + i.quantity, 0);
  return {
    cart_items: cartItemsHtml(items, storeUrl, total),
    cart_items_text: cartItemsText(items, storeUrl),
    cart_total: total > 0 ? brl(total) : "",
    cart_count: count > 0 ? String(count) : "",
    cart_url: cartUrl(storeUrl),
    product_name: first?.name ?? "",
    product_image: first?.image ?? "",
    product_url: first ? absoluteUrl(storeUrl, first.url) : storeUrl,
    store_url: storeUrl,
  };
}

/** Hora "HH:MM" no fuso informado. */
export function localTime(now: Date, tz = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  return `${h === "24" ? "00" : h}:${parts.find((p) => p.type === "minute")?.value ?? "00"}`;
}

/** Janela de silêncio (pode cruzar a meia-noite: 21:00 → 08:00). Início igual ao fim = sem silêncio. */
export function inQuietHours(now: Date, start: string, end: string, tz = "America/Sao_Paulo"): boolean {
  const s = start.slice(0, 5), e = end.slice(0, 5), t = localTime(now, tz);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export interface FlowStep {
  id: string; delay_minutes: number;
  email?: { enabled: boolean; campaign_id: string | null };
  whatsapp?: { enabled: boolean; text: string };
  coupon?: unknown;
}

export const STEP_GAP_MS = 30 * 60_000; // distância mínima entre duas etapas da mesma pessoa

/** Canais ativos da etapa (e-mail precisa de campanha; WhatsApp precisa de texto). */
export function stepChannels(step: FlowStep): ("email" | "whatsapp")[] {
  const out: ("email" | "whatsapp")[] = [];
  if (step.email?.enabled && step.email.campaign_id) out.push("email");
  if (step.whatsapp?.enabled && step.whatsapp.text?.trim()) out.push("whatsapp");
  return out;
}

/**
 * Próxima etapa a executar para um abandono: a primeira que ainda não foi tratada em todos os canais.
 * `done` = chaves "etapa:canal" já registradas; `lastSentAt` = quando saiu a etapa anterior.
 * Devolve null se não há etapa pendente ou se ainda não chegou a hora.
 */
export function nextDueStep(steps: FlowStep[], eventAt: number, now: number, done: Set<string>, lastSentAt: number | null): FlowStep | null {
  const ordered = [...steps].sort((a, b) => a.delay_minutes - b.delay_minutes);
  for (const step of ordered) {
    const channels = stepChannels(step);
    if (!channels.length) continue;
    if (channels.every((c) => done.has(`${step.id}:${c}`))) continue;
    if (now < eventAt + step.delay_minutes * 60_000) return null;
    if (lastSentAt !== null && now < lastSentAt + STEP_GAP_MS) return null;
    return step;
  }
  return null;
}
