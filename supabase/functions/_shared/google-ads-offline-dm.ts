/**
 * Envio da "Compra paga (CRM)" pela Data Manager API (events:ingest).
 * Desde 15/06/2026 o Google so aceita UploadClickConversions na Google Ads API para quem ja usava;
 * contas novas recebem "New integrations ... should use the Data Manager API".
 *
 * Casamento sem gclid (conversoes otimizadas): o Google cruza o e-mail/celular (SHA-256) que enviamos com o
 * que a tag do site (AW-..., conversoes otimizadas ligadas) capturou no checkout. Quando houver gclid, vai junto.
 * Nada de dado pessoal em texto: so hashes. Partes puras testadas em tests/google-ads-offline.test.ts.
 */
import { getAccessToken, type GoogleAdsCredentials } from "./google-ads-api.ts";

type FetchFn = typeof fetch;
export const DM_INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";

/** Regras do Google: minusculas, sem espacos; gmail/googlemail sem pontos e sem "+sufixo" no usuario. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(e);
  if (!m) return null;
  let [, user, domain] = m;
  if (domain === "gmail.com" || domain === "googlemail.com") user = user.split("+")[0].replace(/\./g, "");
  return user ? `${user}@${domain}` : null;
}

/** Celular brasileiro em E.164 (+55DDDNUMERO). Aceita com ou sem 55/mascara; outro formato -> null. */
export function normalizePhoneBR(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? `+55${d}` : null;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** "2026-11-14T23:59:36-03:00" (RFC 3339, horario de Brasilia; sem horario de verao desde 2019). */
export function formatEventTimestamp(d: Date): string {
  const br = new Date(d.getTime() - 3 * 3600_000);
  return br.toISOString().slice(0, 19) + "-03:00";
}

export interface DmOrder { orderNumber: string; value: number; time: Date; email?: string | null; phone?: string | null; gclid?: string | null }

/** Monta o evento; null se nao houver nem identificador de usuario nem gclid (o Google nao teria como casar). */
export async function buildDmEvent(o: DmOrder): Promise<Record<string, unknown> | null> {
  const ids: Record<string, string>[] = [];
  const email = normalizeEmail(o.email);
  const phone = normalizePhoneBR(o.phone);
  if (email) ids.push({ emailAddress: await sha256Hex(email) });
  if (phone) ids.push({ phoneNumber: await sha256Hex(phone) });
  if (!ids.length && !o.gclid) return null;
  return {
    transactionId: o.orderNumber,
    eventTimestamp: formatEventTimestamp(o.time),
    conversionValue: o.value,
    currency: "BRL",
    eventSource: "WEB",
    ...(o.gclid ? { adIdentifiers: { gclid: o.gclid } } : {}),
    ...(ids.length ? { userData: { userIdentifiers: ids } } : {}),
  };
}

export function buildDmRequest(p: { customerId: string; loginCustomerId?: string | null; actionId: number | string; events: unknown[]; validateOnly: boolean }) {
  return {
    destinations: [{
      operatingAccount: { accountType: "GOOGLE_ADS", accountId: p.customerId },
      ...(p.loginCustomerId ? { loginAccount: { accountType: "GOOGLE_ADS", accountId: p.loginCustomerId } } : {}),
      productDestinationId: String(p.actionId),
    }],
    encoding: "HEX",
    events: p.events,
    validateOnly: p.validateOnly,
  };
}

/** Credenciais com o refresh token proprio da Data Manager (escopo datamanager), separado do token do Ads. */
export function dataManagerCredentials(base: GoogleAdsCredentials): GoogleAdsCredentials | null {
  const rt = Deno.env.get("GOOGLE_DM_REFRESH_TOKEN")?.trim();
  return rt ? { ...base, refreshToken: rt } : null;
}

/** Fast-fail: se um evento for invalido, nenhum entra. Devolve requestId ou lanca com a mensagem do Google. */
export async function ingestEvents(creds: GoogleAdsCredentials, body: unknown, fetchFn: FetchFn = fetch): Promise<{ requestId?: string; warnings: number }> {
  const token = await getAccessToken(creds, fetchFn);
  const res = await fetchFn(DM_INGEST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as { requestId?: string; fieldWarnings?: unknown[]; error?: { status?: string; message?: string } };
  if (!res.ok) throw new Error(`${json.error?.status ?? res.status}: ${(json.error?.message ?? "erro na Data Manager API").slice(0, 250)}`);
  return { requestId: json.requestId, warnings: json.fieldWarnings?.length ?? 0 };
}
