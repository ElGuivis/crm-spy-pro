/**
 * Unified dead letter queue helper.
 * Centralizes dead letter handling for all outbound queues (WhatsApp, Instagram, etc).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("dead-letter", "shared");


export interface DeadLetterEntry {
  tenant_id: string;
  source_queue: "outbound_queue" | "instagram_outbox" | string;
  source_item_id: string;
  channel_type: "whatsapp" | "instagram" | string;
  channel_id?: string;
  destination: string; // phone or IGSID
  payload: Record<string, unknown>;
  error_message: string;
  error_code?: string;
  attempts: number;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Insert an item into the unified dead letter queue. */
export async function sendToDeadLetter(entry: DeadLetterEntry): Promise<string | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("dead_letter_queue")
    .insert({
      tenant_id: entry.tenant_id,
      source_queue: entry.source_queue,
      source_item_id: entry.source_item_id,
      channel_type: entry.channel_type,
      channel_id: entry.channel_id,
      destination: entry.destination,
      payload: entry.payload,
      error_message: entry.error_message,
      error_code: entry.error_code,
      attempts: entry.attempts,
      correlation_id: entry.correlation_id,
      metadata: entry.metadata,
    })
    .select("id")
    .single();

  if (error) {
    log.error("Failed to insert dead letter:", error.message);
    return null;
  }
  return data?.id || null;
}

/** Retry dead letter items by resetting source queue status. */
export async function retryDeadLetterItem(itemId: string): Promise<boolean> {
  const supabase = getServiceClient();

  const { data: item, error: fetchErr } = await supabase
    .from("dead_letter_queue")
    .select("id, source_queue, source_item_id, status, tenant_id")
    .eq("id", itemId)
    .eq("status", "dead")
    .single();

  if (fetchErr || !item) return false;

  // Reset source queue item
  if (item.source_queue === "outbound_queue") {
    await supabase.from("outbound_queue").update({
      status: "pending",
      attempts: 0,
      next_retry_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", item.source_item_id);
  } else if (item.source_queue === "instagram_outbox") {
    await supabase.from("instagram_outbox").update({
      status: "pending",
      attempt_count: 0,
      send_after: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }).eq("id", item.source_item_id);
  }

  // Mark dead letter as retried
  await supabase.from("dead_letter_queue")
    .update({ status: "retried", retried_at: new Date().toISOString() })
    .eq("id", itemId);

  return true;
}
