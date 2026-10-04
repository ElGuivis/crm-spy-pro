import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { normalizeEmail, chunkArray } from "./audience-resolvers.ts";

type Supabase = ReturnType<typeof createClient>;

export const SUPPRESSION_REASONS = ["unsubscribed", "bounced", "complained", "invalid", "blocked"] as const;

export { injectTracking } from "../_shared/email-tracking.ts";

export async function getSuppressedEmailSet(supabase: Supabase, tenantId: string, emails: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (!emails.length) return set;
  for (const emailChunk of chunkArray(Array.from(new Set(emails.map(normalizeEmail))).filter(Boolean), 200)) {
    const { data, error } = await supabase.from("email_suppression_list").select("email").eq("tenant_id", tenantId).in("reason", [...SUPPRESSION_REASONS]).in("email", emailChunk);
    if (error) throw error;
    for (const row of data || []) set.add(normalizeEmail((row as Record<string, unknown>).email as string));
  }
  return set;
}
