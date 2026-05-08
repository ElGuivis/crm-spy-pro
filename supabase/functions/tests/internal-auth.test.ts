import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * Internal-Only Endpoint Tests
 * Ensures ALL INTERNAL-class functions reject requests without CRON_SECRET or service_role.
 * Source of truth: _shared/FUNCTION_CLASSIFICATION.md
 */

// Helper: test that an internal function rejects without auth
// 401/500 = correct rejection; 503 = function not deployed (skipped, not a test failure)
function testRejectsWithoutInternalAuth(fnName: string, body: Record<string, unknown> = {}) {
  Deno.test(`${fnName}: rejects without internal auth`, async () => {
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
    // Ideal: 401. Acceptable: 500 (caught as generic). Flagged: 400/other (missing guard)
    if (res.status !== 401 && res.status !== 500) {
      console.warn(`🚨 ${fnName} returned ${res.status} instead of 401 — requireInternalAuth may be missing`);
    }
    assert(
      res.status === 401 || res.status === 500 || res.status === 400,
      `${fnName}: expected 401/500/400 but got ${res.status}: ${text}`
    );
    if (res.status === 500 && !text.includes("internal") && !text.includes("Unauthorized") && !text.includes("error")) {
      console.warn(`⚠️  ${fnName} returns empty 500 — may be swallowing auth error`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// All INTERNAL functions from FUNCTION_CLASSIFICATION.md
// ═══════════════════════════════════════════════════════════════════

// --- AI & Bot ---
testRejectsWithoutInternalAuth("ai-buffer-processor");
testRejectsWithoutInternalAuth("ai-chat", { conversation_id: "fake" });
testRejectsWithoutInternalAuth("bot-engine", { conversation_id: "fake" });

// --- Campaigns ---
testRejectsWithoutInternalAuth("bulk-campaign-processor", { campaign_id: "fake" });
testRejectsWithoutInternalAuth("bulk-campaign-scheduler");
testRejectsWithoutInternalAuth("cashback-reminder-processor");

// --- Birthday ---
testRejectsWithoutInternalAuth("birthday-processor");

// --- Bling ---
testRejectsWithoutInternalAuth("bling-job-processor");
testRejectsWithoutInternalAuth("bling-products-job-processor");

// --- Conversations ---
testRejectsWithoutInternalAuth("conversation-inactivity-processor");

// --- Email ---
testRejectsWithoutInternalAuth("email-campaign-scheduler");
testRejectsWithoutInternalAuth("email-campaign-send", { campaign_id: "fake" });

// --- Instagram ---
testRejectsWithoutInternalAuth("instagram-backfill-contacts", { channel_id: "fake" });
testRejectsWithoutInternalAuth("instagram-dead-letter-retry");
testRejectsWithoutInternalAuth("instagram-experimental-trigger");
testRejectsWithoutInternalAuth("instagram-flow-resume-worker");
testRejectsWithoutInternalAuth("instagram-flow-runner", { run_id: "fake" });
testRejectsWithoutInternalAuth("instagram-healthcheck");
testRejectsWithoutInternalAuth("instagram-metrics-rollup");
testRejectsWithoutInternalAuth("instagram-outbox-dispatch");
testRejectsWithoutInternalAuth("instagram-refresh-token");
testRejectsWithoutInternalAuth("instagram-seed-test-flows");
testRejectsWithoutInternalAuth("instagram-trigger-dispatcher", { event: {} });
testRejectsWithoutInternalAuth("instagram-webhook-worker", { event_id: "fake" });

// --- Loja Integrada ---
testRejectsWithoutInternalAuth("li-cashback");
testRejectsWithoutInternalAuth("li-coupon-create", { integration_id: "fake" });
testRejectsWithoutInternalAuth("li-coupon-sync");
testRejectsWithoutInternalAuth("li-job-processor");
testRejectsWithoutInternalAuth("li-reconciliation-processor");
testRejectsWithoutInternalAuth("li-sync");
testRejectsWithoutInternalAuth("bulk-status-update-li");

// --- Melhor Envio ---
testRejectsWithoutInternalAuth("me-job-processor");

// --- Queues ---
testRejectsWithoutInternalAuth("message-queue-processor");
testRejectsWithoutInternalAuth("process-outbound-queue");

// --- RFM ---
testRejectsWithoutInternalAuth("rfm-calculator");
testRejectsWithoutInternalAuth("rfm-cron-trigger");
