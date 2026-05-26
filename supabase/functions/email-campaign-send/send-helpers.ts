import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { normalizeEmail, chunkArray } from "./audience-resolvers.ts";

type Supabase = ReturnType<typeof createClient>;

export const SUPPRESSION_REASONS = ["unsubscribed", "bounced", "complained", "invalid", "blocked"] as const;

export function injectTracking(html: string, supabaseUrl: string, tokenId: string): string {
  const pixel = `<img src="${supabaseUrl}/functions/v1/email-track-open?t=${tokenId}" width="1" height="1" style="display:none;" alt="">`;
  let result = html.includes("</body>") ? html.replace("</body>", `${pixel}</body>`) : html + pixel;
  result = result.replace(
    /<a(\s[^>]*?)?href="(https?:\/\/[^"]+)"([^>]*)>/gi,
    (match, before, url, after) => {
      if (url.includes("/email-track-") || url.includes("/email-unsubscribe")) return match;
      const trackUrl = `${supabaseUrl}/functions/v1/email-track-click?t=${tokenId}&url=${encodeURIComponent(url)}`;
      return `<a${before ?? ""}href="${trackUrl}"${after}>`;
    },
  );
  return result;
}

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
