/**
 * API de Conversões da Meta (envio do servidor), 22/11/2026.
 *
 * O mesmo evento sai do navegador (fbq) e daqui com o MESMO `event_id`: a Meta junta os dois
 * (desduplicação). Dados pessoais vão em SHA-256, normalizados como a Meta pede (minúsculas, sem
 * espaços; telefone só dígitos com DDI 55). IP, navegador e os cookies _fbp/_fbc vão sem hash.
 * Doc: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters
 */

const GRAPH = "https://graph.facebook.com/v23.0";

export interface MetaUser {
  email?: string;
  phone?: string;       // só dígitos, com ou sem 55
  firstName?: string;
  lastName?: string;
  externalId?: string;  // id do cadastro
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

export interface MetaEvent {
  pixelId: string;
  token: string;
  testEventCode?: string | null;
  eventName: "Lead" | "CompleteRegistration" | "PageView" | "ViewContent";
  eventId: string;
  eventSourceUrl?: string | null;
  user: MetaUser;
}

async function sha256(v: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const norm = (v?: string | null) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9@._+-]/g, "");

export function metaPhone(digits?: string | null): string {
  const d = (digits ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length <= 11 ? `55${d}` : d;
}

export async function buildUserData(u: MetaUser): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { country: [await sha256("br")] };
  const add = async (key: string, raw: string) => { if (raw) out[key] = [await sha256(raw)]; };
  await add("em", norm(u.email));
  await add("ph", metaPhone(u.phone));
  await add("fn", norm(u.firstName));
  await add("ln", norm(u.lastName));
  await add("external_id", norm(u.externalId));
  if (u.ip) out.client_ip_address = u.ip;
  if (u.userAgent) out.client_user_agent = u.userAgent;
  if (u.fbp && /^fb\.\d\.\d+\.\d+$/.test(u.fbp)) out.fbp = u.fbp;
  if (u.fbc && /^fb\.\d\.\d+\.\S+$/.test(u.fbc)) out.fbc = u.fbc;
  return out;
}

export async function sendMetaEvent(e: MetaEvent): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{10,20}$/.test(e.pixelId) || !e.token) return { ok: false, error: "pixel ou token ausente" };
  const payload: Record<string, unknown> = {
    data: [{
      event_name: e.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: e.eventId,
      action_source: "website",
      ...(e.eventSourceUrl ? { event_source_url: e.eventSourceUrl } : {}),
      user_data: await buildUserData(e.user),
    }],
    ...(e.testEventCode ? { test_event_code: e.testEventCode } : {}),
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${GRAPH}/${e.pixelId}/events?access_token=${encodeURIComponent(e.token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      if (res.ok) return { ok: true };
      // 4xx = dado/token errado, não adianta repetir
      if (res.status < 500) return { ok: false, error: `${res.status} ${text.slice(0, 300)}` };
      if (attempt === 2) return { ok: false, error: `${res.status} ${text.slice(0, 300)}` };
    } catch (err) {
      if (attempt === 2) return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return { ok: false, error: "sem resposta" };
}
