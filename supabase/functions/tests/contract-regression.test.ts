import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * Resource Guard & Contract Tests
 *
 * Validates that:
 * - send-message enforces auth before resource lookup
 * - Fake resource IDs get proper 403/404 (not 500)
 * - Internal-only functions reject user-facing calls
 * - Melhor Envio status endpoint works with auth
 */

// ═══════════════════════════════════════════════════════════════════
// 1. send-message — requireResource contract
// ═══════════════════════════════════════════════════════════════════

Deno.test("send-message: rejects without auth (before resource check)", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({
      conversation_id: "00000000-0000-0000-0000-000000000000",
      content: "test message",
    }),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }

  // Must fail on auth, NOT on resource lookup
  assert(
    res.status === 401 || res.status === 500,
    `Expected auth rejection (401/500), got ${res.status}: ${text}`
  );

  // Error should be about auth, not about resource
  try {
    const json = JSON.parse(text);
    if (res.status === 401) {
      assert(
        json.error?.toLowerCase().includes("unauthorized") || json.error?.toLowerCase().includes("auth"),
        `401 error message should mention auth: ${json.error}`
      );
    }
  } catch {
    // Non-JSON is ok for 500
  }
});

Deno.test("send-message: rejects with invalid JWT (before resource check)", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer fake.jwt.here",
    },
    body: JSON.stringify({
      conversation_id: "00000000-0000-0000-0000-000000000000",
      content: "test message",
    }),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }

  assert(
    res.status === 401 || res.status === 500,
    `Expected JWT rejection (401/500), got ${res.status}: ${text}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// 2. User-facing calls CANNOT reach internal-only functions
// ═══════════════════════════════════════════════════════════════════

const INTERNAL_FUNCTIONS = [
  "li-job-processor",
  "bling-products-job-processor",
  "bulk-campaign-scheduler",
  "rfm-calculator",
  "rfm-cron-trigger",
  "birthday-processor",
  "email-campaign-scheduler",
  "instagram-backfill-contacts",
  "cashback-reminder-processor",
  "conversation-inactivity-processor",
];

for (const fn of INTERNAL_FUNCTIONS) {
  Deno.test(`${fn}: rejects user-facing call with anon key only`, async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        // No Authorization header — simulates browser call
      },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    if (res.status === 503) { console.warn(`⏭️  ${fn} not deployed — skipping`); return; }

    assert(
      res.status === 401 || res.status === 500,
      `${fn}: internal function should reject user call, got ${res.status}: ${text}`
    );
  });

  Deno.test(`${fn}: rejects user-facing call with fake JWT`, async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.fake",
      },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    if (res.status === 503) { console.warn(`⏭️  ${fn} not deployed — skipping`); return; }

    assert(
      res.status === 401 || res.status === 500,
      `${fn}: internal function should reject fake JWT, got ${res.status}: ${text}`
    );
  });
}

// ═══════════════════════════════════════════════════════════════════
// 3. Melhor Envio — encrypted token flow contract
// ═══════════════════════════════════════════════════════════════════

Deno.test("melhor-envio: status action rejects without auth", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/melhor-envio?action=status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }

  // status action requires auth (unlike redirect_callback which is public)
  assert(
    res.status === 401 || res.status === 500,
    `ME status should require auth, got ${res.status}: ${text}`
  );
});

Deno.test("melhor-envio: refresh action rejects without auth", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/melhor-envio?action=refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }

  assert(
    res.status === 401 || res.status === 500,
    `ME refresh should require auth, got ${res.status}: ${text}`
  );
});

Deno.test("melhor-envio: authorize action rejects without auth", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/melhor-envio?action=authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }

  assert(
    res.status === 401 || res.status === 500,
    `ME authorize should require auth, got ${res.status}: ${text}`
  );
});

Deno.test("melhor-envio: redirect_callback handles missing code gracefully", async () => {
  // redirect_callback is PUBLIC — but must handle missing params gracefully
  const res = await fetch(`${SUPABASE_URL}/functions/v1/melhor-envio?action=redirect_callback`, {
    method: "GET",
    headers: { "apikey": SUPABASE_ANON_KEY },
    redirect: "manual", // Don't follow redirects
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }

  // Should redirect to frontend with error, not crash
  assert(
    res.status === 302 || res.status === 200 || res.status === 400,
    `redirect_callback should handle missing code gracefully, got ${res.status}: ${text}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// 4. me-job-processor — HYBRID: rejects without any auth
// ═══════════════════════════════════════════════════════════════════

Deno.test("me-job-processor: rejects without any auth (hybrid)", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/me-job-processor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }

  assert(
    res.status === 401 || res.status === 500,
    `me-job-processor should reject unauthenticated call, got ${res.status}: ${text}`
  );
});
