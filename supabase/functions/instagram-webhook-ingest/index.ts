import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

async function computeHmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPayload(payload: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-webhook-ingest", cid);
  // === GET: Webhook Verification (Meta challenge) ===
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");

    if (mode === "subscribe" && token === verifyToken) {
      log.info("[instagram-webhook] ✅ Verification successful");
      return new Response(challenge, { status: 200 });
    }
    log.warn("[instagram-webhook] ❌ Verification failed");
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // === POST: Ingest webhook payload ===
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // Validate HMAC signature
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET")!;

  let signatureValid = false;
  if (signature && appSecret) {
    const expectedSig = "sha256=" + await computeHmacSha256(appSecret, rawBody);
    signatureValid = signature === expectedSig;
  }

  if (!signatureValid) {
    log.warn("[instagram-webhook] ❌ Invalid signature");
    // Still return 200 to avoid Meta retries, but don't process
    return new Response("OK", { status: 200 });
  }

  // Parse payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log.error("[instagram-webhook] ❌ Invalid JSON");
    return new Response("OK", { status: 200 });
  }

  // Only process instagram object
  if (payload.object !== "instagram") {
    log.info("[instagram-webhook] Skipping non-instagram object:", payload.object);
    return new Response("OK", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Compute event hash for dedup
  const eventHash = await hashPayload(rawBody);

  // Check for duplicates
  const { data: existing } = await supabase
    .from("instagram_webhook_deliveries")
    .select("id")
    .eq("event_hash", eventHash)
    .limit(1)
    .maybeSingle();

  if (existing) {
    log.info("[instagram-webhook] ⏭️ Duplicate event, skipping");
    return new Response("OK", { status: 200 });
  }

  // Extract channel info from entries
  const entries = payload.entry || [];
  let channelId: string | null = null;
  let providerDeliveryKey = "";

  for (const entry of entries) {
    const igUserId = entry.id;
    providerDeliveryKey = `${igUserId}_${entry.time || Date.now()}`;

    // Find channel by ig_user_id
    const { data: channel } = await supabase
      .from("instagram_channels")
      .select("id, tenant_id")
      .eq("ig_user_id", igUserId)
      .in("status", ["connected", "expiring"])
      .maybeSingle();

    if (channel) {
      channelId = channel.id;
      break;
    }
  }

  // Persist raw webhook delivery
  const { error: insertError } = await supabase
    .from("instagram_webhook_deliveries")
    .insert({
      channel_id: channelId,
      provider_delivery_key: providerDeliveryKey,
      event_hash: eventHash,
      signature_valid: signatureValid,
      payload: payload,
      processed: false,
      parse_status: "pending",
    });

  if (insertError) {
    log.error("[instagram-webhook] ❌ Insert error:", insertError);
  } else {
    log.info("[instagram-webhook] ✅ Persisted delivery:", providerDeliveryKey);
  }

  // Respond 200 immediately - worker will process later
  return new Response("OK", { status: 200 });
});
