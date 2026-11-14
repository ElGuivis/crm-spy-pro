import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type Supabase = ReturnType<typeof createClient>;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // sem 0/o/1/i/l

/** Código curto determinístico: o mesmo carrinho sempre gera o mesmo código (etapas diferentes reaproveitam o link). */
export async function shortCode(seed: string, length = 7): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret || "sem-segredo"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(seed)));
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[sig[i] % ALPHABET.length];
  return out;
}

/**
 * Link curto para `target` no domínio `base` (ex.: https://r.usechronic.com.br), válido por 30 dias.
 * Sem `base` ou se o banco falhar, devolve o link longo: o envio nunca depende do encurtador.
 */
export async function shortLinkFor(supabase: Supabase, opts: { tenantId: string; seed: string; target: string; fallback: string; base: string | null | undefined }): Promise<string> {
  const base = opts.base?.trim().replace(/\/$/, "");
  if (!base || !/^https:\/\//.test(base)) return opts.target;
  try {
    const code = await shortCode(`${opts.tenantId}:${opts.seed}`);
    const { error } = await supabase.from("short_links").upsert(
      { code, tenant_id: opts.tenantId, target_url: opts.target, fallback_url: opts.fallback },
      { onConflict: "code", ignoreDuplicates: true },
    );
    return error ? opts.target : `${base}/${code}`;
  } catch {
    return opts.target;
  }
}
