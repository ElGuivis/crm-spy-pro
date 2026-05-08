import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("secret-crypto", "shared");


/**
 * Decrypt a secret stored with public.encrypt_secret() using the database vault key.
 * This calls the SECURITY DEFINER function, so the encryption key never leaves the DB.
 */
export async function decryptSecret(
  supabase: ReturnType<typeof createClient>,
  ciphertext: string | null
): Promise<string | null> {
  if (!ciphertext || ciphertext === "") return null;

  const { data, error } = await supabase.rpc("decrypt_secret", {
    _ciphertext: ciphertext,
  });

  if (error) {
    log.error("[decrypt-secret] RPC error:", error.message);
    return null;
  }

  return data as string | null;
}

/**
 * Encrypt a plaintext secret using the database vault key.
 * Returns the ciphertext for storage.
 */
export async function encryptSecret(
  supabase: ReturnType<typeof createClient>,
  plaintext: string
): Promise<string | null> {
  if (!plaintext || plaintext === "") return null;

  const { data, error } = await supabase.rpc("encrypt_secret", {
    _plaintext: plaintext,
  });

  if (error) {
    log.error("[encrypt-secret] RPC error:", error.message);
    return null;
  }

  return data as string | null;
}
