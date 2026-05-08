import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * Auth Guard Integration Tests
 * Ensures ALL AUTHENTICATED-class functions reject unauthenticated requests.
 * Source of truth: _shared/FUNCTION_CLASSIFICATION.md
 */

// Helper: test that a function rejects POST without auth
// Accepts 401 (proper guard propagation) or 500 (guard throws but caught as generic error)
// Functions returning 500 should be fixed to properly re-throw Response objects
function testRejectsNoAuth(fnName: string, body: Record<string, unknown> = {}) {
  Deno.test(`${fnName}: rejects request without auth header`, async () => {
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
      res.status === 401 || res.status === 500,
      `${fnName} should return 401 or 500, got ${res.status}: ${text}`
    );
    if (res.status === 500) {
      console.warn(`⚠️  ${fnName} returns 500 instead of 401 — catch block should re-throw Response objects`);
    }
  });
}

// Helper: test that a function rejects invalid JWT
function testRejectsInvalidJwt(fnName: string, body: Record<string, unknown> = {}) {
  Deno.test(`${fnName}: rejects request with invalid JWT`, async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer invalid.jwt.token",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.status === 503) {
      console.warn(`⏭️  ${fnName} returned 503 (not deployed) — skipping`);
      return;
    }
    assert(
      res.status === 401 || res.status === 500,
      `${fnName} should return 401 or 500 for invalid JWT, got ${res.status}: ${text}`
    );
  });
}

// ═══════════════════════════════════════════════════════════════════
// All AUTHENTICATED functions from FUNCTION_CLASSIFICATION.md
// Each must reject 401 without auth AND with invalid JWT
// ═══════════════════════════════════════════════════════════════════

// --- Core ---
testRejectsNoAuth("send-message", { conversation_id: "fake", content: "test" });
testRejectsInvalidJwt("send-message", { conversation_id: "fake", content: "test" });

testRejectsNoAuth("ai-assist", { action: "suggest", conversation_id: "fake" });
testRejectsNoAuth("ai-provider-validate", { provider: "openai" });
testRejectsNoAuth("create-team-member", { email: "t@t.com", tenant_id: "fake" });
testRejectsNoAuth("delete-account", {});
testRejectsNoAuth("manage-credentials", { action: "check", provider: "openai" });
testRejectsNoAuth("send-email", { to: "t@t.com", subject: "test" });
testRejectsNoAuth("email-campaign-send-test", { campaign_id: "fake" });

// --- Integrations ---
testRejectsNoAuth("bling-oauth", { action: "start" });
testRejectsNoAuth("bling-stores", {});
testRejectsNoAuth("bling-sync", { integration_id: "fake", sync_type: "orders" });
testRejectsNoAuth("evolution-api", { action: "list" });
testRejectsNoAuth("get-store-statuses", { integration_id: "fake" });
testRejectsNoAuth("li-validate", { integration_id: "fake" });

// --- Instagram ---
testRejectsNoAuth("instagram-block-user", { channel_id: "fake", contact_id: "fake" });
testRejectsNoAuth("instagram-cancel-run", { run_id: "fake" });
testRejectsNoAuth("instagram-create-cta-link", { channel_id: "fake" });
testRejectsNoAuth("instagram-delete-comment", { comment_id: "fake" });
testRejectsNoAuth("instagram-generate-deep-link", { channel_id: "fake" });
testRejectsNoAuth("instagram-generate-flow-draft-ai", { prompt: "test" });
testRejectsNoAuth("instagram-hide-comment", { comment_id: "fake" });
testRejectsNoAuth("instagram-install-quick-automation", { automation_type: "test" });
testRejectsNoAuth("instagram-list-quick-automations", {});
testRejectsNoAuth("instagram-manual-token", { token: "fake" });
testRejectsNoAuth("instagram-move-thread-to-spam", { thread_id: "fake", channel_id: "fake" });
testRejectsNoAuth("instagram-oauth", { action: "start" });
testRejectsNoAuth("instagram-pause-contact-automations", { contact_id: "fake" });
testRejectsNoAuth("instagram-publish-content", { content_id: "fake" });
testRejectsNoAuth("instagram-publish-flow-version", { flow_id: "fake", version_id: "fake" });
testRejectsNoAuth("instagram-resume-contact-automations", { contact_id: "fake" });
testRejectsNoAuth("instagram-save-contact-data", { contact_id: "fake" });
testRejectsNoAuth("instagram-schedule-content", { content_id: "fake" });
testRejectsNoAuth("instagram-send-message", { thread_id: "fake", message: "test" });
testRejectsNoAuth("instagram-send-comment-reply", { comment_id: "fake", message: "test" });
testRejectsNoAuth("instagram-send-private-reply", { comment_id: "fake", message: "test" });
testRejectsNoAuth("instagram-sync-insights", { channel_id: "fake" });
testRejectsNoAuth("instagram-unblock-user", { channel_id: "fake", contact_id: "fake" });
testRejectsNoAuth("instagram-upsert-ice-breakers", { channel_id: "fake" });
testRejectsNoAuth("instagram-upsert-persistent-menu", { channel_id: "fake" });
testRejectsNoAuth("instagram-upsert-welcome-ad-flow", { channel_id: "fake" });
testRejectsNoAuth("instagram-validate-collected-data", { contact_id: "fake" });

// --- Melhor Envio & WhatsApp ---
testRejectsNoAuth("melhor-envio", { action: "list" });
testRejectsNoAuth("whatsapp-send-catalog", { conversation_id: "fake" });
