import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * Team Invite Flow Contract Tests
 *
 * Validates the create → validate → accept invite pipeline:
 * - create-team-member requires auth (AUTHENTICATED)
 * - validate-team-invite is public but rejects invalid tokens
 * - accept-team-invite is public but rejects invalid tokens
 */

// ═══════════════════════════════════════════════════════════════════
// 1. create-team-member — MUST require user auth
// ═══════════════════════════════════════════════════════════════════

Deno.test("create-team-member: rejects without auth", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-team-member`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: "test@example.com", role: "member", tenant_id: "fake-uuid" }),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }
  assert(
    res.status === 401 || res.status === 500,
    `Expected 401/500 but got ${res.status}: ${text}`
  );
});

Deno.test("create-team-member: rejects with invalid JWT", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-team-member`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer fake.jwt.token",
    },
    body: JSON.stringify({ email: "test@example.com", role: "member", tenant_id: "fake-uuid" }),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }
  assert(
    res.status === 401 || res.status === 500,
    `Expected 401/500 but got ${res.status}: ${text}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// 2. validate-team-invite — PUBLIC but validates token
// ═══════════════════════════════════════════════════════════════════

Deno.test("validate-team-invite: rejects missing token gracefully", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-team-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }
  assert(res.status !== 500, `Should handle missing token gracefully, got 500: ${text}`);
  assert(
    res.status === 400 || res.status === 404 || res.status === 200,
    `Expected 400/404/200 for missing token, got ${res.status}: ${text}`
  );
});

Deno.test("validate-team-invite: rejects invalid token", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-team-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({ invite_token: "totally-invalid-token-12345" }),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }
  assert(res.status !== 500, `Should handle invalid token gracefully, got 500: ${text}`);

  // Parse response — should indicate invalid/not found
  try {
    const json = JSON.parse(text);
    assert(
      json.valid === false || json.error,
      `Expected valid=false or error in response, got: ${text}`
    );
  } catch {
    // Non-JSON response is acceptable if status is 400/404
    assert(res.status === 400 || res.status === 404, `Non-JSON response with unexpected status ${res.status}`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// 3. accept-team-invite — PUBLIC but validates token + requires password
// ═══════════════════════════════════════════════════════════════════

Deno.test("accept-team-invite: rejects missing fields gracefully", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/accept-team-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }
  assert(res.status !== 500, `Should handle missing fields gracefully, got 500: ${text}`);
});

Deno.test("accept-team-invite: rejects invalid invite token", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/accept-team-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({
      invite_token: "totally-invalid-token-12345",
      password: "SecurePassword123!",
      full_name: "Test User",
    }),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }
  assert(res.status !== 500, `Should handle invalid token gracefully, got 500: ${text}`);
  assert(
    res.status === 400 || res.status === 404 || res.status === 422,
    `Expected 400/404/422 for invalid invite, got ${res.status}: ${text}`
  );
});

// ═══════════════════════════════════════════════════════════════════
// 4. Cross-check: create-team-member cannot be called without auth
//    even when providing valid-looking data
// ═══════════════════════════════════════════════════════════════════

Deno.test("create-team-member: no auth bypass with complete payload", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-team-member`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({
      email: "bypass-attempt@evil.com",
      role: "admin",
      tenant_id: "00000000-0000-0000-0000-000000000000",
      permissions: [{ permission: "settings", can_view: true, can_edit: true }],
    }),
  });
  const text = await res.text();
  if (res.status === 503) { console.warn("⏭️  not deployed — skipping"); return; }
  assert(
    res.status === 401 || res.status === 500,
    `Should still require auth even with complete payload, got ${res.status}: ${text}`
  );
});
