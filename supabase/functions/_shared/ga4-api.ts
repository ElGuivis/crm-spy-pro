// Leitura do GA4 (Data API) por conta de serviço, só leitura. A chave JSON fica em GA4_SERVICE_ACCOUNT_B64 (base64 do arquivo)
// e a propriedade em GA4_PROPERTY_ID; nenhum dos dois vai para o repositório.
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

interface ServiceAccount { client_email: string; private_key: string }

export interface Ga4Config { account: ServiceAccount; propertyId: string; tenantId: string }

/** null = GA4 não configurado neste ambiente. */
export function loadGa4Config(): Ga4Config | null {
  const b64 = Deno.env.get("GA4_SERVICE_ACCOUNT_B64")?.trim();
  const propertyId = Deno.env.get("GA4_PROPERTY_ID")?.trim();
  const tenantId = Deno.env.get("GA4_TENANT_ID")?.trim();
  if (!b64 || !propertyId || !tenantId) return null;
  const account = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))) as ServiceAccount;
  return { account, propertyId, tenantId };
}

const b64url = (data: string | Uint8Array) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function accessToken(account: ServiceAccount): Promise<string> {
  const pem = account.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3000 }))}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const j = await res.json() as { access_token?: string; error_description?: string };
  if (!j.access_token) throw new Error(`GA4: token recusado (${j.error_description ?? res.status})`);
  return j.access_token;
}

export interface Ga4Report { dimensionHeaders: { name: string }[]; rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }

export async function runGa4Report(cfg: Ga4Config, body: Record<string, unknown>): Promise<Ga4Report> {
  const token = await accessToken(cfg.account);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${cfg.propertyId}:runReport`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GA4 respondeu ${res.status}`);
  return await res.json() as Ga4Report;
}
