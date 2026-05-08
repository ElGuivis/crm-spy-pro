import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { readBlingTokens, writeBlingTokens } from "./credential-helpers.ts";
import { createLogger } from "./correlation.ts";
const log = createLogger("bling-token-refresh", "shared");


/**
 * Shared Bling token refresh logic.
 * Reads tokens from encrypted columns (with plaintext fallback),
 * refreshes if expiring, writes back to both encrypted and plaintext.
 */
export async function ensureBlingToken(
  supabase: ReturnType<typeof createClient>,
  connection: Record<string, unknown>,
  logPrefix = "[bling]"
): Promise<string> {
  // Read tokens preferring encrypted columns
  const tokens = await readBlingTokens(supabase, connection);
  if (!tokens) {
    throw new Error(`${logPrefix} No valid tokens found for connection ${connection.id}`);
  }

  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();

  // If token expires in less than 5 minutes, refresh it
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    log.info(`${logPrefix} Token expiring soon, refreshing...`);

    const clientId = Deno.env.get("BLING_CLIENT_ID");
    const clientSecret = Deno.env.get("BLING_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      throw new Error("Missing Bling credentials");
    }

    const credentials = btoa(`${clientId}:${clientSecret}`);

    const tokenResponse = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      log.error(`${logPrefix} Token refresh failed:`, errorText);
      throw new Error("Failed to refresh Bling token");
    }

    const tokenData = await tokenResponse.json();
    const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Write new tokens (both encrypted + plaintext for backward compat)
    await writeBlingTokens(supabase, connection.id, tokenData.access_token, tokenData.refresh_token, {
      token_expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });

    log.info(`${logPrefix} Token refreshed successfully`);
    return tokenData.access_token;
  }

  return tokens.accessToken;
}
