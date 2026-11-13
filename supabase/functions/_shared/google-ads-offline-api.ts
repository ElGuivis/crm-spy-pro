/**
 * Envio de conversoes offline ao Google Ads (REST). Escrita: so a funcao google-ads-offline-conversions usa.
 * partialFailure ligado: uma venda com problema nao derruba as outras; o erro vem por indice.
 * Sem retentativa automatica em 5xx/429 (evita duplicar); a funcao tenta de novo no proximo ciclo e o orderId
 * impede duplicata no Google.
 */
import { describeApiError, getAccessToken, GOOGLE_ADS_API_VERSION, GoogleAdsApiError, type GoogleAdsCredentials } from "./google-ads-api.ts";

type FetchFn = typeof fetch;

async function postUpload(
  creds: GoogleAdsCredentials,
  customerId: string,
  method: "uploadClickConversions" | "uploadConversionAdjustments",
  payload: Record<string, unknown>,
  fetchFn: FetchFn,
): Promise<unknown> {
  if (!/^\d{10}$/.test(customerId)) throw new GoogleAdsApiError("customer_id invalido (use 10 digitos)", 400, "BAD_CUSTOMER_ID");
  const accessToken = await getAccessToken(creds, fetchFn);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": creds.developerToken,
    "Content-Type": "application/json",
  };
  if (creds.loginCustomerId) headers["login-customer-id"] = creds.loginCustomerId;
  const res = await fetchFn(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:${method}`, {
    method: "POST", headers, body: JSON.stringify({ ...payload, partialFailure: true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { message, code } = describeApiError(json);
    throw new GoogleAdsApiError(message, res.status, code);
  }
  return json;
}

export const uploadClickConversions = (creds: GoogleAdsCredentials, customerId: string, conversions: unknown[], validateOnly = false, fetchFn: FetchFn = fetch) =>
  postUpload(creds, customerId, "uploadClickConversions", { conversions, validateOnly }, fetchFn);

export const uploadConversionAdjustments = (creds: GoogleAdsCredentials, customerId: string, adjustments: unknown[], validateOnly = false, fetchFn: FetchFn = fetch) =>
  postUpload(creds, customerId, "uploadConversionAdjustments", { conversionAdjustments: adjustments, validateOnly }, fetchFn);
