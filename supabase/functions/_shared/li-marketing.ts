// Cliente da API de Marketing da Loja Integrada (/v3/marketing). Especificação: https://api-docs.lojaintegrada.com.br/
// Observado na loja real (a documentação difere em alguns pontos):
//  - lista de campanhas: { campaigns: [...], total }; a campanha de navegação pode vir com recipient nulo e o e-mail só em recipientIdentifier;
//  - lista de espera: { total_records, results: [{ produto_id, produto_nome, inscricoes, estoque, ... }] } (snake_case);
//  - o carrinho (details.cart) vem vazio depois que a campanha termina (status "F"): capture enquanto está pendente.
// Nunca registre e-mail/telefone em log.

export const LI_V3_BASE = "https://api.awsli.com.br";

export type FlowKind = "cart" | "browse" | "order";
export const FLOW_KINDS: FlowKind[] = ["cart", "browse", "order"];

/** identifier devolvido por /automations/active → tipo do nosso fluxo */
export const KIND_BY_IDENTIFIER: Record<string, FlowKind> = {
  AbandonedCartAutomation: "cart",
  AbandonedBrowsingAutomation: "browse",
  AbandonedOrderAutomation: "order",
};
/** chave aceita por POST /rules/toggle */
export const TOGGLE_KEY: Record<FlowKind, string> = { cart: "abandoned-cart", browse: "abandoned-product", order: "cancelled-order" };

export interface LiAutomation { id: number; identifier: string; title: string }
export interface LiRule { id: number; automationId: number; triggerDelay: number; active: boolean }
export interface LiAutomationConfig { id: number; storeId: number; custom: string | null; startInterval: string | null; endInterval: string | null }
export interface LiCampaign {
  id: number; ruleId: number | null; status: string | null; value: number | null;
  custom: { id: number; quantity: number }[] | null;
  recipient: { name: string | null; email: string | null; cellPhone: string | null } | null;
  recipientIdentifier: string | null; lastSentDate: string | null; createdAt: string | null; eventAt: string | null;
  productIds: number[] | null; orderIds: number[] | null; clientId: number | null; automationId: number; storeId: number;
}

export class LiApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch com timeout e nova tentativa em 429/5xx (a API recusa rajadas). */
export async function liFetch(authHeader: string, path: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${LI_V3_BASE}${path}`, {
        ...init,
        headers: { Authorization: authHeader, "Content-Type": "application/json", ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status !== 429 && res.status < 500) return res;
      last = res;
    } catch (e) {
      if (i === attempts - 1) throw e;
    }
    await sleep(600 * (i + 1) * (last?.status === 429 ? 3 : 1));
  }
  return last as Response;
}

async function liJson<T>(authHeader: string, path: string, init?: RequestInit): Promise<T> {
  const res = await liFetch(authHeader, path, init);
  if (!res.ok) throw new LiApiError(res.status, `Loja Integrada respondeu ${res.status} em ${path.split("?")[0]}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const listAutomations = (auth: string) => liJson<LiAutomation[]>(auth, "/v3/marketing/automations/active");
export const listRules = (auth: string, automationId: number) => liJson<LiRule[]>(auth, `/v3/marketing/rules/channels/${automationId}`);
export const getAutomationConfig = (auth: string) => liJson<LiAutomationConfig>(auth, "/v3/marketing/automations/config");

export async function listCampaigns(auth: string, automationId: number, limit: number, offset: number): Promise<{ campaigns: LiCampaign[]; total: number }> {
  const r = await liJson<{ campaigns?: LiCampaign[]; total?: number }>(auth, `/v3/marketing/campaign/${automationId}?limit=${limit}&offset=${offset}`);
  return { campaigns: r?.campaigns ?? [], total: r?.total ?? 0 };
}

export const getCampaignDetails = (auth: string, campaignId: number) => liJson<Record<string, unknown>>(auth, `/v3/marketing/campaign/details/${campaignId}`);

/** Liga/desliga automações nativas (só as chaves informadas). Devolve o estado confirmado pela loja. */
export const setNativeToggles = (auth: string, body: Partial<Record<string, boolean>>) =>
  liJson<Record<string, boolean>>(auth, "/v3/marketing/rules/toggle", { method: "POST", body: JSON.stringify(body) });

export async function optOutAutomation(auth: string, recipient: string, storeId: number, automationId: number): Promise<void> {
  await liJson(auth, "/v3/marketing/automations/optout", { method: "POST", body: JSON.stringify({ recipient, storeId, automationId }) });
}

/** Remove da newsletter da loja (204 = não estava lá; é sucesso). */
export async function deleteNewsletterEmail(auth: string, email: string): Promise<void> {
  const res = await liFetch(auth, `/v3/marketing/newsletter/${encodeURIComponent(email)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204 && res.status !== 404) throw new LiApiError(res.status, `Loja Integrada respondeu ${res.status} ao remover da newsletter`);
}

export async function subscribeNewsletter(auth: string, email: string, name?: string): Promise<void> {
  await liJson(auth, "/v3/marketing/newsletter", { method: "POST", body: JSON.stringify({ email, ...(name ? { name } : {}) }) });
}

export interface WaitlistItem { produto_id: number; produto_nome: string | null; sku: string | null; inscricoes: number; estoque: number | null; produto_pai_id: number | null; is_variation: boolean }
export async function listWaitlist(auth: string, page: number, pageSize: number): Promise<{ results: WaitlistItem[]; total: number }> {
  const r = await liJson<{ results?: WaitlistItem[]; items?: WaitlistItem[]; total_records?: number; total?: number }>(auth, `/v3/marketing/awaiting/list?page=${page}&pageSize=${pageSize}&withVariation=true`);
  return { results: r?.results ?? r?.items ?? [], total: r?.total_records ?? r?.total ?? 0 };
}

const isEmail = (s: string | null | undefined) => !!s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

/** Linha pronta para li_abandonment_campaigns (sem itens enriquecidos: isso é feito com o catálogo local). */
export function normalizeCampaign(c: LiCampaign, kind: FlowKind) {
  const ident = (c.recipientIdentifier ?? "").trim();
  const email = (isEmail(c.recipient?.email) ? c.recipient!.email! : isEmail(ident) ? ident : "").toLowerCase() || null;
  const phone = c.recipient?.cellPhone || (!isEmail(ident) && /^\+?\d{10,15}$/.test(ident) ? ident : null);
  const qtyById = new Map((c.custom ?? []).map((i) => [Number(i.id), Math.max(1, Number(i.quantity) || 1)]));
  const productIds = (c.productIds?.length ? c.productIds : [...qtyById.keys()]).map(Number);
  return {
    li_campaign_id: c.id,
    automation_id: c.automationId,
    kind,
    rule_id: c.ruleId ?? null,
    li_status: c.status ?? null,
    value: Number(c.value) || 0,
    product_ids: productIds,
    quantities: Object.fromEntries(qtyById),
    recipient_email: email,
    recipient_name: c.recipient?.name?.trim() || null,
    recipient_phone: phone,
    client_id: c.clientId && c.clientId > 0 ? c.clientId : null,
    event_at: c.eventAt ?? c.createdAt ?? null,
    li_last_sent_at: c.lastSentDate ?? null,
  };
}

/**
 * Tenta tirar os itens do carrinho do detalhe da campanha (formato só visto vazio na loja real: items[] do cart).
 * Aceita variações de nome de campo; o que não for reconhecido cai no catálogo local pelo id do produto.
 */
export function extractCartItems(details: Record<string, unknown>): { product_id: number | null; quantity: number; name: string | null; price: number | null; image: string | null; url: string | null }[] {
  const cart = (details?.cart ?? {}) as Record<string, unknown>;
  const items = Array.isArray(cart.items) ? cart.items as Record<string, unknown>[] : [];
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  return items.map((it) => {
    const p = (it.product ?? it.produto ?? {}) as Record<string, unknown>;
    return {
      product_id: num(it.product_id ?? it.produto_id ?? p.id),
      quantity: Math.max(1, num(it.quantity ?? it.quantidade) ?? 1),
      name: String(it.name ?? it.nome ?? p.name ?? p.nome ?? "") || null,
      price: num(it.price ?? it.preco ?? it.unit_price ?? p.price),
      image: String(it.image ?? it.imagem ?? p.image ?? "") || null,
      url: String(it.url ?? p.url ?? "") || null,
    };
  });
}
