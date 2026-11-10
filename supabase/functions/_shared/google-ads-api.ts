/**
 * Cliente minimo da Google Ads API (REST) para as edge functions.
 *
 * - Credenciais vem dos secrets da funcao (nunca do banco): GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID,
 *   GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN e, se usar MCC, GOOGLE_ADS_LOGIN_CUSTOMER_ID.
 * - Somente LEITURA (GAQL). Escrita na conta fica em modulo proprio e so roda via recomendacao aprovada.
 * - Repete (com espera) em 429 e 5xx. Nunca loga tokens.
 */

export const GOOGLE_ADS_API_VERSION = Deno.env.get("GOOGLE_ADS_API_VERSION") ?? "v26";
const API_BASE = "https://googleads.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_ATTEMPTS = 3;

export interface GoogleAdsCredentials {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId?: string;
}

export class GoogleAdsApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

/** Le as credenciais dos secrets. Falha com a lista do que falta (sem mostrar valores). */
export function loadCredentials(loginCustomerId?: string | null): GoogleAdsCredentials {
  const get = (k: string) => Deno.env.get(k)?.trim() || "";
  const creds = {
    developerToken: get("GOOGLE_ADS_DEVELOPER_TOKEN"),
    clientId: get("GOOGLE_ADS_CLIENT_ID"),
    clientSecret: get("GOOGLE_ADS_CLIENT_SECRET"),
    refreshToken: get("GOOGLE_ADS_REFRESH_TOKEN"),
  };
  const missing = Object.entries({
    GOOGLE_ADS_DEVELOPER_TOKEN: creds.developerToken,
    GOOGLE_ADS_CLIENT_ID: creds.clientId,
    GOOGLE_ADS_CLIENT_SECRET: creds.clientSecret,
    GOOGLE_ADS_REFRESH_TOKEN: creds.refreshToken,
  }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new GoogleAdsApiError(`Secrets ausentes: ${missing.join(", ")}`, 500, "MISSING_SECRETS");
  const login = (loginCustomerId || get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") || "").replace(/\D/g, "");
  return { ...creds, loginCustomerId: login || undefined };
}

type FetchFn = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cache do access token por refresh token (vale ~1h; renova 60 s antes). */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function clearTokenCache(): void {
  tokenCache.clear();
}

export async function getAccessToken(creds: GoogleAdsCredentials, fetchFn: FetchFn = fetch): Promise<string> {
  const cached = tokenCache.get(creds.refreshToken);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    // invalid_grant = refresh token revogado/expirado: precisa reautorizar
    throw new GoogleAdsApiError(
      `Falha ao renovar o token do Google (${json.error ?? res.status}): ${json.error_description ?? "sem detalhes"}`,
      res.status,
      json.error === "invalid_grant" ? "INVALID_GRANT" : "TOKEN_ERROR",
    );
  }
  tokenCache.set(creds.refreshToken, {
    token: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  });
  return json.access_token;
}

/** Extrai a mensagem util do erro padrao da API do Google. */
export function describeApiError(body: unknown): { message: string; code?: string } {
  const err = (body as { error?: { message?: string; status?: string; details?: Array<{ errors?: Array<{ errorCode?: Record<string, string>; message?: string }> }> } })?.error;
  const first = err?.details?.[0]?.errors?.[0];
  const code = first?.errorCode ? Object.values(first.errorCode)[0] : err?.status;
  return { message: first?.message ?? err?.message ?? "Erro desconhecido da Google Ads API", code };
}

export type GaqlRow = Record<string, Record<string, unknown>>;

/**
 * Executa uma consulta GAQL (somente leitura) e devolve todas as linhas, paginando.
 * customerId: 10 digitos, sem hifen.
 */
export async function gaqlSearch(
  creds: GoogleAdsCredentials,
  customerId: string,
  query: string,
  fetchFn: FetchFn = fetch,
): Promise<GaqlRow[]> {
  if (!/^\d{10}$/.test(customerId)) throw new GoogleAdsApiError("customer_id invalido (use 10 digitos)", 400, "BAD_CUSTOMER_ID");

  const rows: GaqlRow[] = [];
  let pageToken: string | undefined;
  do {
    const body = await postWithRetry(creds, customerId, { query, ...(pageToken ? { pageToken } : {}) }, fetchFn);
    if (Array.isArray(body.results)) rows.push(...(body.results as GaqlRow[]));
    pageToken = typeof body.nextPageToken === "string" && body.nextPageToken ? body.nextPageToken : undefined;
  } while (pageToken);
  return rows;
}

async function postWithRetry(
  creds: GoogleAdsCredentials,
  customerId: string,
  payload: Record<string, unknown>,
  fetchFn: FetchFn,
): Promise<{ results?: unknown[]; nextPageToken?: string }> {
  const url = `${API_BASE}/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;
  let lastError: GoogleAdsApiError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const accessToken = await getAccessToken(creds, fetchFn);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": creds.developerToken,
      "Content-Type": "application/json",
    };
    if (creds.loginCustomerId) headers["login-customer-id"] = creds.loginCustomerId;

    const res = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;

    const { message, code } = describeApiError(json);
    lastError = new GoogleAdsApiError(message, res.status, code);
    if (res.status === 401) tokenCache.clear(); // token invalido: forca renovar na proxima tentativa
    const retryable = res.status === 429 || res.status >= 500 || res.status === 401;
    if (!retryable || attempt === MAX_ATTEMPTS) break;
    await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastError!;
}

/**
 * Escrita no Google Ads (mutate; uma ou VARIAS operacoes na mesma chamada, que o Google aplica todas ou nenhuma). Sem retentativa em 5xx/429: uma alteracao duplicada ou duvidosa e pior que um erro claro.
 * So renova o token e tenta de novo UMA vez em 401. `path` e relativo a /customers/<id>/, ex.: "campaigns:mutate".
 */
export async function mutateResource(
  creds: GoogleAdsCredentials,
  customerId: string,
  path: "campaigns:mutate" | "campaignBudgets:mutate" | "campaignCriteria:mutate" | "adGroupCriteria:mutate" | "adGroupAds:mutate",
  operation: Record<string, unknown> | Record<string, unknown>[],
  fetchFn: FetchFn = fetch,
): Promise<unknown> {
  if (!/^\d{10}$/.test(customerId)) throw new GoogleAdsApiError("customer_id invalido (use 10 digitos)", 400, "BAD_CUSTOMER_ID");
  let lastError: GoogleAdsApiError | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const accessToken = await getAccessToken(creds, fetchFn);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": creds.developerToken,
      "Content-Type": "application/json",
    };
    if (creds.loginCustomerId) headers["login-customer-id"] = creds.loginCustomerId;
    const res = await fetchFn(`${API_BASE}/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/${path}`, {
      method: "POST", headers, body: JSON.stringify({ operations: Array.isArray(operation) ? operation : [operation] }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;
    const { message, code } = describeApiError(json);
    lastError = new GoogleAdsApiError(message, res.status, code);
    if (res.status === 401 && attempt === 1) { tokenCache.clear(); continue; }
    break;
  }
  throw lastError!;
}
