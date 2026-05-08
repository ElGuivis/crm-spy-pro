import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptSecret, encryptSecret } from "./secret-crypto.ts";
import type { BlingConnectionRecord, MelhorEnvioTokenRecord, EmailIntegrationRecord } from "./supabase-types.ts";

/**
 * Credential helpers — encrypted-only.
 * Plaintext columns are cleared by DB triggers on write;
 * these helpers never read or write plaintext fields.
 */

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

type ServiceClient = ReturnType<typeof createClient>;

/**
 * Read Bling access/refresh tokens from encrypted columns.
 */
export async function readBlingTokens(
  supabase: ServiceClient,
  connection: Pick<BlingConnectionRecord, 'access_token_encrypted' | 'refresh_token_encrypted'>
): Promise<TokenPair | null> {
  if (!connection.access_token_encrypted || !connection.refresh_token_encrypted) {
    return null;
  }

  const accessToken = await decryptSecret(supabase, connection.access_token_encrypted);
  const refreshToken = await decryptSecret(supabase, connection.refresh_token_encrypted);

  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/**
 * Write Bling tokens — encrypted only.
 * The DB trigger `encrypt_bling_tokens` handles encryption if writing
 * to plaintext columns, but we encrypt explicitly and skip plaintext entirely.
 */
export async function writeBlingTokens(
  supabase: ServiceClient,
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  extraFields: Record<string, unknown> = {}
): Promise<void> {
  const encAccess = await encryptSecret(supabase, accessToken);
  const encRefresh = await encryptSecret(supabase, refreshToken);

  await supabase
    .from("bling_connections")
    .update({
      access_token: "",           // clear plaintext
      refresh_token: "",          // clear plaintext
      access_token_encrypted: encAccess,
      refresh_token_encrypted: encRefresh,
      ...extraFields,
    })
    .eq("id", connectionId);
}

/**
 * Read SMTP password from encrypted column only.
 */
export async function readSmtpPassword(
  supabase: ServiceClient,
  emailIntegration: Pick<EmailIntegrationRecord, 'smtp_password_encrypted'>
): Promise<string | null> {
  if (!emailIntegration.smtp_password_encrypted) return null;
  return await decryptSecret(supabase, emailIntegration.smtp_password_encrypted);
}

/**
 * Read Melhor Envio tokens from encrypted columns only.
 */
export async function readMelhorEnvioTokens(
  supabase: ServiceClient,
  tokenRecord: Pick<MelhorEnvioTokenRecord, 'access_token_encrypted' | 'refresh_token_encrypted'>
): Promise<TokenPair | null> {
  if (!tokenRecord.access_token_encrypted) return null;

  const accessToken = await decryptSecret(supabase, tokenRecord.access_token_encrypted);
  if (!accessToken) return null;

  let refreshToken = "";
  if (tokenRecord.refresh_token_encrypted) {
    refreshToken = (await decryptSecret(supabase, tokenRecord.refresh_token_encrypted)) || "";
  }

  return { accessToken, refreshToken };
}

/**
 * Write Melhor Envio tokens — encrypted only.
 * Clears plaintext fields explicitly.
 */
export async function writeMelhorEnvioTokens(
  supabase: ServiceClient,
  tenantId: string,
  accessToken: string,
  refreshToken: string,
  extraFields: Record<string, unknown> = {}
): Promise<void> {
  const encAccess = await encryptSecret(supabase, accessToken);
  const encRefresh = await encryptSecret(supabase, refreshToken);

  await supabase
    .from("melhor_envio_tokens")
    .upsert({
      tenant_id: tenantId,
      access_token: "",              // clear plaintext
      refresh_token: "",             // clear plaintext
      access_token_encrypted: encAccess,
      refresh_token_encrypted: encRefresh,
      ...extraFields,
    }, { onConflict: "tenant_id" });
}
