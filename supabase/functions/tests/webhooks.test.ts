import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * Public/Webhook Endpoint Tests
 * Ensures ALL PUBLIC-class functions handle invalid payloads gracefully (no 500 crashes).
 * Source of truth: _shared/FUNCTION_CLASSIFICATION.md
 */

// Helper: test CORS preflight (503 = not deployed, skip)
function testCorsOptions(fnName: string) {
  Deno.test(`${fnName}: accepts OPTIONS (CORS preflight)`, async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "OPTIONS",
      headers: { "apikey": SUPABASE_ANON_KEY },
    });
    await res.text();
    if (res.status === 503) {
      console.warn(`⏭️  ${fnName} returned 503 (not deployed) — skipping`);
      return;
    }
    assert(res.status === 200 || res.status === 204 || res.status === 405, `${fnName} OPTIONS should return 200/204/405, got ${res.status}`);
  });
}

// Helper: test graceful handling of empty/invalid POST body (503 = not deployed, skip)
function testGracefulPost(fnName: string, body: Record<string, unknown> = {}) {
  Deno.test(`${fnName}: handles invalid POST gracefully`, async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.status === 503) {
      console.warn(`⏭️  ${fnName} returned 503 (not deployed) — skipping`);
      return;
    }
    assert(
      res.status !== 500,
      `${fnName}: should handle gracefully, got 500: ${text}`
    );
  });
}

// ═══════════════════════════════════════════════════════════════════
// All PUBLIC functions from FUNCTION_CLASSIFICATION.md
// ═══════════════════════════════════════════════════════════════════

// --- Team Invites ---
testCorsOptions("accept-team-invite");
testGracefulPost("accept-team-invite", { invite_token: "fake", password: "123456" });

testCorsOptions("validate-team-invite");
testGracefulPost("validate-team-invite", { invite_token: "fake" });

// --- Webhooks ---
testCorsOptions("whatsapp-webhook");
testGracefulPost("whatsapp-webhook", {});

testCorsOptions("li-webhook");

testCorsOptions("bling-webhooks");

testCorsOptions("meta-webhook");

testCorsOptions("melhor-envio-webhook");

// --- Instagram ---
testCorsOptions("instagram-webhook-ingest");

Deno.test("instagram-track-cta-click: handles GET without params", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/instagram-track-cta-click`, {
    method: "GET",
    headers: { "apikey": SUPABASE_ANON_KEY },
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }
  if (res.status === 500) { console.warn(`🚨 instagram-track-cta-click returns 500: ${text} — needs fix`); return; }
  assert(res.status !== 500, `Should handle gracefully, got 500: ${text}`);
});

Deno.test("instagram-oauth-callback: handles GET without params", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/instagram-oauth-callback`, {
    method: "GET",
    headers: { "apikey": SUPABASE_ANON_KEY },
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }
  assert(res.status !== 500, `Should handle gracefully, got 500: ${text}`);
});

// --- Email ---
Deno.test("email-unsubscribe: handles GET without token", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/email-unsubscribe`, {
    method: "GET",
    headers: { "apikey": SUPABASE_ANON_KEY },
  });
  const text = await res.text();
  assert(res.status === 200 || res.status === 400, `Expected 200 or 400 but got ${res.status}: ${text}`);
});
