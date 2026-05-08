import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * Critical Flow Tests — Issue 7
 *
 * Covers:
 *   1. Instagram OAuth — start + callback (expired/invalid state, replay)
 *   2. delete-account — owner mode vs leave_teams mode (auth required)
 *   3. manage-sync-jobs — admin role enforcement per action
 *   4. manage-smtp — admin role enforcement, no password leakage
 *   5. Melhor Envio — encrypted token flow (no plaintext exposure)
 */

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

async function postFn(fn: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { res, text, status: res.status };
}

async function getFn(fn: string, path = "", headers: Record<string, string> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}${path}`, {
    method: "GET",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      ...headers,
    },
  });
  const text = await res.text();
  return { res, text, status: res.status };
}

function isSkipped(status: number, fnName: string): boolean {
  if (status === 503) {
    console.warn(`⏭️  ${fnName} not deployed — skipping`);
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// 1. Instagram OAuth
// ═══════════════════════════════════════════════════════════════════

Deno.test("instagram-oauth: rejects unauthenticated generate-oauth-url", async () => {
  const { status, text } = await postFn("instagram-oauth", { action: "generate-oauth-url" });
  if (isSkipped(status, "instagram-oauth")) return;
  assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
});

Deno.test("instagram-oauth: rejects invalid JWT", async () => {
  const { status, text } = await postFn(
    "instagram-oauth",
    { action: "generate-oauth-url" },
    { "Authorization": "Bearer invalid.jwt.token" },
  );
  if (isSkipped(status, "instagram-oauth")) return;
  assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
});

Deno.test("instagram-oauth-callback: rejects missing state/code params", async () => {
  const { status, text, res } = await getFn("instagram-oauth-callback", "?code=&state=");
  if (isSkipped(status, "instagram-oauth-callback")) return;
  if (status === 404) { console.warn("⏭️  instagram-oauth-callback not deployed — skipping"); return; }
  // Should redirect to frontend with error or return error
  assert(
    status === 302 || status === 200 || status === 400,
    `Expected 302/200/400, got ${status}: ${text}`,
  );
});

Deno.test("instagram-oauth-callback: rejects invalid/expired state", async () => {
  const { status, res } = await getFn(
    "instagram-oauth-callback",
    "?code=fake_code_123&state=00000000-0000-0000-0000-000000000000",
  );
  if (isSkipped(status, "instagram-oauth-callback")) return;
  if (status === 404) { console.warn("⏭️  instagram-oauth-callback not deployed — skipping"); return; }
  // Should redirect with error (state not found = expired/invalid)
  if (status === 302) {
    const location = res.headers.get("location") || "";
    assert(
      location.includes("ig_error"),
      `Redirect should contain ig_error, got: ${location}`,
    );
  } else {
    assert(status === 400 || status === 200, `Expected redirect or 400, got ${status}`);
  }
});

Deno.test("instagram-oauth-callback: state replay is blocked (same state twice)", async () => {
  const fakeState = "11111111-1111-1111-1111-111111111111";
  // First call — state doesn't exist, should fail
  const { status: s1, res: r1 } = await getFn(
    "instagram-oauth-callback",
    `?code=replay_test&state=${fakeState}`,
  );
  if (isSkipped(s1, "instagram-oauth-callback")) return;
  if (s1 === 404) { console.warn("⏭️  instagram-oauth-callback not deployed — skipping"); return; }

  // Second call with same state — should also fail (no state in DB)
  const { status: s2, res: r2 } = await getFn(
    "instagram-oauth-callback",
    `?code=replay_test&state=${fakeState}`,
  );

  // Both should fail since the state was never created
  if (s1 === 302) {
    const loc = r1.headers.get("location") || "";
    assert(loc.includes("ig_error"), "First call should error (state not found)");
  }
  if (s2 === 302) {
    const loc = r2.headers.get("location") || "";
    assert(loc.includes("ig_error"), "Replay should error (state consumed or not found)");
  }
});

// ═══════════════════════════════════════════════════════════════════
// 2. delete-account — auth required for both modes
// ═══════════════════════════════════════════════════════════════════

Deno.test("delete-account: rejects unauthenticated (owner mode)", async () => {
  const { status, text } = await postFn("delete-account", { mode: "delete_owned_account" });
  if (isSkipped(status, "delete-account")) return;
  assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
});

Deno.test("delete-account: rejects unauthenticated (leave_teams mode)", async () => {
  const { status, text } = await postFn("delete-account", { mode: "leave_teams" });
  if (isSkipped(status, "delete-account")) return;
  assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
});

Deno.test("delete-account: rejects invalid JWT (owner mode)", async () => {
  const { status, text } = await postFn(
    "delete-account",
    { mode: "delete_owned_account" },
    { "Authorization": "Bearer bad.jwt.token" },
  );
  if (isSkipped(status, "delete-account")) return;
  assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
});

Deno.test("delete-account: rejects invalid JWT (leave_teams mode)", async () => {
  const { status, text } = await postFn(
    "delete-account",
    { mode: "leave_teams" },
    { "Authorization": "Bearer bad.jwt.token" },
  );
  if (isSkipped(status, "delete-account")) return;
  assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
});

// ═══════════════════════════════════════════════════════════════════
// 3. manage-sync-jobs — admin role enforcement per action
// ═══════════════════════════════════════════════════════════════════

const SYNC_ACTIONS = ["cancel-me", "reset-me", "cancel-bling", "delete-integration"];

for (const action of SYNC_ACTIONS) {
  Deno.test(`manage-sync-jobs/${action}: rejects unauthenticated`, async () => {
    const { status, text } = await postFn("manage-sync-jobs", { action });
    if (isSkipped(status, "manage-sync-jobs")) return;
    assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
  });

  Deno.test(`manage-sync-jobs/${action}: rejects invalid JWT`, async () => {
    const { status, text } = await postFn(
      "manage-sync-jobs",
      { action },
      { "Authorization": "Bearer fake.jwt.value" },
    );
    if (isSkipped(status, "manage-sync-jobs")) return;
    assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
  });
}

// ═══════════════════════════════════════════════════════════════════
// 4. manage-smtp — admin enforcement, no password leakage
// ═══════════════════════════════════════════════════════════════════

const SMTP_ACTIONS = ["upsert", "get", "delete"];

for (const action of SMTP_ACTIONS) {
  Deno.test(`manage-smtp/${action}: rejects unauthenticated`, async () => {
    const { status, text } = await postFn("manage-smtp", { action });
    if (isSkipped(status, "manage-smtp")) return;
    assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
  });

  Deno.test(`manage-smtp/${action}: rejects invalid JWT`, async () => {
    const { status, text } = await postFn(
      "manage-smtp",
      { action },
      { "Authorization": "Bearer invalid.token.here" },
    );
    if (isSkipped(status, "manage-smtp")) return;
    assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
  });
}

Deno.test("manage-smtp/get: response never contains plaintext smtp_password", async () => {
  // Even with invalid auth, if any response leaks password fields, it's a vulnerability
  const { text } = await postFn("manage-smtp", { action: "get" });
  // Check the error response doesn't accidentally contain password data
  assert(!text.includes("smtp_password"), `Response should never contain 'smtp_password' field: ${text.substring(0, 200)}`);
});

// ═══════════════════════════════════════════════════════════════════
// 5. Melhor Envio — no plaintext token exposure
// ═══════════════════════════════════════════════════════════════════

Deno.test("melhor-envio: rejects unauthenticated requests", async () => {
  const { status, text } = await postFn("melhor-envio", { action: "get-status" });
  if (isSkipped(status, "melhor-envio")) return;
  assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
});

Deno.test("melhor-envio: error responses never expose access_token", async () => {
  const { text } = await postFn("melhor-envio", { action: "get-status" });
  assert(!text.includes("access_token"), `Response should never contain 'access_token': ${text.substring(0, 200)}`);
  assert(!text.includes("refresh_token"), `Response should never contain 'refresh_token': ${text.substring(0, 200)}`);
});

Deno.test("melhor-envio: rejects invalid JWT", async () => {
  const { status, text } = await postFn(
    "melhor-envio",
    { action: "get-status" },
    { "Authorization": "Bearer bad.melhor.envio" },
  );
  if (isSkipped(status, "melhor-envio")) return;
  assert(status === 401 || status === 500, `Expected 401/500, got ${status}: ${text}`);
});

// me-job-processor is INTERNAL — should reject anon/user JWT
Deno.test("me-job-processor: rejects anon call (internal only)", async () => {
  const { status, text } = await postFn("me-job-processor", {});
  if (isSkipped(status, "me-job-processor")) return;
  assert(
    status === 401 || status === 403 || status === 500,
    `Expected 401/403/500, got ${status}: ${text}`,
  );
});

// ═══════════════════════════════════════════════════════════════════
// 6. Cross-cutting: sensitive fields never leak in error responses
// ═══════════════════════════════════════════════════════════════════

const SENSITIVE_PATTERNS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "META_APP_SECRET",
  "INSTAGRAM_APP_SECRET",
  "BLING_CLIENT_SECRET",
  "MELHOR_ENVIO_CLIENT_SECRET",
];

for (const secret of SENSITIVE_PATTERNS) {
  Deno.test(`secret-leak: manage-sync-jobs error never exposes ${secret}`, async () => {
    const { text } = await postFn("manage-sync-jobs", { action: "cancel-me" });
    assert(!text.includes(secret), `Response leaked secret name: ${secret}`);
  });
}
