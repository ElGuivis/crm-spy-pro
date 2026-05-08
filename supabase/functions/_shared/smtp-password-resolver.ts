import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { readSmtpPassword } from "./credential-helpers.ts";

/**
 * Resolve the SMTP password from an email integration record.
 * Prefers encrypted column, falls back to plaintext.
 */
export async function resolveSmtpPassword(
  supabase: ReturnType<typeof createClient>,
  emailIntegration: Record<string, unknown>
): Promise<string> {
  const password = await readSmtpPassword(supabase, emailIntegration);
  if (!password) {
    throw new Error("SMTP password not found");
  }
  return password;
}
