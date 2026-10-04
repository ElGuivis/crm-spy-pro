import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { chunkArray, type Recipient } from "./audience-resolvers.ts";

type Supabase = ReturnType<typeof createClient>;

export interface Sender { email: string; name: string }

/** Grava a fila de envio (um registro por destinatário) com o remetente já definido, em rodízio. */
export async function buildQueue(supabase: Supabase, tenantId: string, campaignId: string, recipients: Recipient[], senders: Sender[]): Promise<number> {
  const rows = recipients.map((r, i) => ({
    tenant_id: tenantId,
    campaign_id: campaignId,
    recipient_email: r.email,
    recipient_name: r.name,
    recipient_phone: r.phone,
    sender_email: senders[i % senders.length].email,
    sender_name: senders[i % senders.length].name,
  }));
  for (const chunk of chunkArray(rows, 500)) {
    const { error } = await supabase.from("email_send_queue").upsert(chunk, { onConflict: "campaign_id,recipient_email", ignoreDuplicates: true });
    if (error) throw error;
  }
  return rows.length;
}

/** E-mails que já estão na fila das outras campanhas do mesmo teste A/B (o vencedor vai só para quem ficou de fora). */
export async function siblingRecipients(supabase: Supabase, abTestId: string, exceptCampaignId: string): Promise<Set<string>> {
  const { data: siblings } = await supabase.from("email_campaigns").select("id").eq("ab_test_id", abTestId).neq("id", exceptCampaignId);
  const ids = (siblings ?? []).map((s) => s.id as string);
  const emails = new Set<string>();
  if (!ids.length) return emails;
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("email_send_queue").select("recipient_email").in("campaign_id", ids).range(from, from + 999);
    for (const r of data ?? []) emails.add(String(r.recipient_email).toLowerCase());
    if (!data || data.length < 1000) break;
  }
  return emails;
}

export async function queueCount(supabase: Supabase, campaignId: string): Promise<number> {
  const { count } = await supabase.from("email_send_queue").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  return count ?? 0;
}

export interface Progress { pending: number; sending: number; sent: number; failed: number; total: number }

export async function queueProgress(supabase: Supabase, campaignId: string): Promise<Progress> {
  const count = async (status?: string) => {
    let q = supabase.from("email_send_queue").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
    if (status) q = q.eq("status", status);
    const { count: c } = await q;
    return c ?? 0;
  };
  const [pending, sending, sent, failed, total] = await Promise.all([count("pending"), count("sending"), count("sent"), count("failed"), count()]);
  return { pending, sending, sent, failed, total };
}
