import { decryptTokenAES as decryptToken } from "./ig-crypto.ts";

export type InstagramApiHost = "graph.instagram.com" | "graph.facebook.com";

const API_VERSION = "v21.0";

function normalizeToken(raw: string): string {
  let token = raw.trim();

  token = token.replace(/^Bearer\s+/i, "");
  token = token.replace(/^"+|"+$/g, "");
  token = token.replace(/^'+|'+$/g, "");
  token = token.replace(/[\u200B-\u200D\uFEFF]/g, "");
  token = token.replace(/\s+/g, "");

  if (token.includes("%")) {
    try {
      token = decodeURIComponent(token);
    } catch {
      // best-effort decode only
    }
  }

  return token;
}

export function getInstagramEncryptionKeys(): string[] {
  const keys = [
    Deno.env.get("IG_TOKEN_ENCRYPTION_KEY")?.trim(),
    Deno.env.get("INSTAGRAM_APP_SECRET")?.trim(),
    Deno.env.get("META_APP_SECRET")?.trim(),
  ].filter((v): v is string => Boolean(v));

  return Array.from(new Set(keys));
}

export function getPrimaryInstagramEncryptionKey(): string {
  const keys = getInstagramEncryptionKeys();
  if (!keys.length) {
    throw new Error("Missing token encryption secrets");
  }
  return keys[0];
}

async function validateOnHost(token: string, host: InstagramApiHost): Promise<{ ok: boolean; error?: string }> {
  const url = host === "graph.instagram.com"
    ? `https://graph.instagram.com/${API_VERSION}/me?fields=id,username&access_token=${encodeURIComponent(token)}`
    : `https://graph.facebook.com/${API_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;

  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok || data?.error) {
    return {
      ok: false,
      error: data?.error?.message || `HTTP ${resp.status}`,
    };
  }

  return { ok: true };
}

export async function resolveInstagramAccessToken(encryptedToken: string): Promise<{
  accessToken: string;
  host: InstagramApiHost;
  keyUsed: string;
}> {
  const keys = getInstagramEncryptionKeys();
  if (!keys.length) {
    throw new Error("Missing token encryption secrets");
  }

  let lastError: string | null = null;

  for (const key of keys) {
    try {
      const decrypted = await decryptToken(encryptedToken, key);
      const token = normalizeToken(decrypted);
      if (!token) continue;

      for (const host of ["graph.instagram.com", "graph.facebook.com"] as const) {
        const validation = await validateOnHost(token, host);
        if (validation.ok) {
          return { accessToken: token, host, keyUsed: key };
        }
        lastError = validation.error || "Invalid token";
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(lastError || "Token do Instagram inválido ou incompatível");
}
