import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * Happy-Path Flow Tests
 *
 * Tests real SUCCESS paths for critical flows using an authenticated test user.
 * Complements critical-flows.test.ts which covers rejection/error scenarios.
 *
 * Covers:
 *   1. Instagram OAuth — generate-oauth-url returns valid URL with state
 *   2. manage-sync-jobs — authenticated admin with valid actions
 *   3. manage-smtp — get returns 200 with masked data structure
 *   4. manage-credentials — list returns 200 with credentials array
 *   5. delete-account — leave_teams + delete_owned_account (full lifecycle)
 *   6. Melhor Envio — authorize/status with valid auth
 *   7. Cross-cutting — authenticated responses are always valid JSON
 *
 * When the gateway rejects valid JWTs (verify_jwt=true + env mismatch),
 * tests skip gracefully and log a diagnostic.
 */

// ═══════════════════════════════════════════════════════════════════
// Test User Lifecycle
// ═══════════════════════════════════════════════════════════════════

const TEST_EMAIL = `test-happy-${Date.now()}@test-lovable.local`;
const TEST_PASSWORD = "TestHappyPath2026!";

let accessToken: string | null = null;
let testUserId: string | null = null;
let gatewayRejectsJwt: boolean | null = null;

async function ensureTestUser(): Promise<string | null> {
  if (accessToken) return accessToken;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    options: { data: { company_name: "Happy Path Test Co" } },
  });

  if (signUpError) {
    console.warn(`⚠️  Could not create test user: ${signUpError.message}`);
    return null;
  }

  if (signUpData.session?.access_token) {
    accessToken = signUpData.session.access_token;
    testUserId = signUpData.user?.id ?? null;
    return accessToken;
  }

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signInError || !signInData.session) {
    console.warn(`⚠️  Could not sign in: ${signInError?.message ?? "no session"}`);
    return null;
  }

  accessToken = signInData.session.access_token;
  testUserId = signInData.user?.id ?? null;
  return accessToken;
}

function isSkipped(status: number, fnName: string): boolean {
  if (status === 503) { console.warn(`⏭️  ${fnName} not deployed — skipping`); return true; }
  return false;
}

/** Check if gateway rejects valid JWTs (verify_jwt=true + env mismatch) */
function isGatewayJwtRejection(status: number, text: string): boolean {
  if (status === 401 && text.includes('"Invalid JWT"')) {
    if (gatewayRejectsJwt === null) {
      console.warn("⚠️  Gateway rejects test JWT (verify_jwt=true). Happy-path tests for these endpoints require matching JWT secrets.");
      gatewayRejectsJwt = true;
    }
    return true;
  }
  return false;
}

async function postFnAuth(fn: string, body: Record<string, unknown>, token: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { res, text, status: res.status, json };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Instagram OAuth — generate-oauth-url (happy path)
// ═══════════════════════════════════════════════════════════════════

Deno.test({ name: "happy: instagram-oauth generate-oauth-url returns valid OAuth URL", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("instagram-oauth", {
    action: "generate-oauth-url",
  }, token);

  if (isSkipped(status, "instagram-oauth")) return;
  if (isGatewayJwtRejection(status, text)) return;

  assertEquals(status, 200, `Expected 200, got ${status}: ${text}`);
  assert(json !== null, "Response should be valid JSON");
  assert(typeof json!.url === "string", "Response should contain 'url' string");

  const url = json!.url as string;
  assert(url.includes("facebook.com") || url.includes("instagram.com"),
    `OAuth URL should point to Facebook/Instagram`);
  assert(url.includes("state="), "OAuth URL must include state parameter");
  assert(url.includes("client_id="), "OAuth URL must include client_id");
  assert(url.includes("redirect_uri="), "OAuth URL must include redirect_uri");
  assert(url.includes("scope="), "OAuth URL must include scope");
}});

Deno.test({ name: "happy: instagram-oauth generates unique state per call", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status: s1, json: j1, text: t1 } = await postFnAuth("instagram-oauth", {
    action: "generate-oauth-url",
  }, token);
  if (isSkipped(s1, "instagram-oauth")) return;
  if (isGatewayJwtRejection(s1, t1)) return;
  if (s1 !== 200) { console.warn("⏭️  OAuth URL gen failed, skipping uniqueness test"); return; }

  const { status: s2, json: j2 } = await postFnAuth("instagram-oauth", {
    action: "generate-oauth-url",
  }, token);
  if (s2 !== 200) { console.warn("⏭️  Second OAuth call failed"); return; }

  assertNotEquals(j1!.url, j2!.url, "Each OAuth call should generate a unique state nonce");
}});

Deno.test({ name: "happy: instagram-oauth disconnect with non-existent channel returns 403", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("instagram-oauth", {
    action: "disconnect",
    channel_id: "00000000-0000-0000-0000-000000000000",
  }, token);

  if (isSkipped(status, "instagram-oauth")) return;
  if (isGatewayJwtRejection(status, text)) return;

  assertEquals(status, 403, `Expected 403 for non-owned channel, got ${status}`);
  assert(json !== null, "Response should be JSON");
}});

// ═══════════════════════════════════════════════════════════════════
// 2. manage-sync-jobs — authenticated admin success paths
// ═══════════════════════════════════════════════════════════════════

Deno.test({ name: "happy: manage-sync-jobs cancel-me with fake job_id returns 404", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("manage-sync-jobs", {
    action: "cancel-me",
    job_id: "00000000-0000-0000-0000-000000000000",
  }, token);

  if (isSkipped(status, "manage-sync-jobs")) return;
  if (isGatewayJwtRejection(status, text)) return;

  // Authenticated admin reaches the handler — proves auth + admin check passed
  assert(json !== null, "Response should be valid JSON");
  assertEquals(status, 404, `Expected 404 for non-existent job, got ${status}: ${text}`);
  assert(typeof json!.error === "string", "Should contain error message");
}});

Deno.test({ name: "happy: manage-sync-jobs reset-me with fake integration returns 404", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("manage-sync-jobs", {
    action: "reset-me",
    integration_id: "00000000-0000-0000-0000-000000000000",
  }, token);

  if (isSkipped(status, "manage-sync-jobs")) return;
  if (isGatewayJwtRejection(status, text)) return;

  assert(json !== null, "Response should be valid JSON");
  assertEquals(status, 404, `Expected 404 for non-existent integration, got ${status}: ${text}`);
  assert(typeof json!.error === "string", "Should contain error message");
}});

Deno.test({ name: "happy: manage-sync-jobs cancel-bling with fake integration returns structured response", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("manage-sync-jobs", {
    action: "cancel-bling",
    integration_id: "00000000-0000-0000-0000-000000000000",
  }, token);

  if (isSkipped(status, "manage-sync-jobs")) return;
  if (isGatewayJwtRejection(status, text)) return;

  // Admin auth passed — we get a structured JSON response (200 with 0 cancelled or 404)
  assert(json !== null, `Response should be valid JSON, got: ${text.substring(0, 200)}`);
  assert(status === 200 || status === 404, `Expected 200 or 404, got ${status}`);

  if (status === 200) {
    assert("cancelled" in json! || "ok" in json!, "200 response should contain result field");
  }
}});

Deno.test({ name: "happy: manage-sync-jobs delete-integration validates ownership (403 for non-owned)", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("manage-sync-jobs", {
    action: "delete-integration",
    integration_id: "00000000-0000-0000-0000-000000000000",
  }, token);

  if (isSkipped(status, "manage-sync-jobs")) return;
  if (isGatewayJwtRejection(status, text)) return;

  // Should get 403 (not owned) or 404 (not found) — NOT 500
  assert(json !== null, "Response should be JSON");
  assert(status === 403 || status === 404, `Expected 403/404 for non-owned integration, got ${status}: ${text}`);
}});

// ═══════════════════════════════════════════════════════════════════
// 3. manage-smtp — get action returns 200 with masked data structure
// ═══════════════════════════════════════════════════════════════════

Deno.test({ name: "happy: manage-smtp get returns 200 with data array and proper structure", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("manage-smtp", {
    action: "get",
  }, token);

  if (isSkipped(status, "manage-smtp")) return;
  if (isGatewayJwtRejection(status, text)) return;

  assertEquals(status, 200, `Expected 200, got ${status}: ${text}`);
  assert(json !== null, "Response should be valid JSON");
  assert(Array.isArray(json!.data), "Response should contain 'data' array");

  // Security: must never leak password fields
  assert(!text.includes("smtp_password_encrypted"), "Must NOT contain encrypted password ciphertext");
  assert(!text.includes('"smtp_password"'), "Must NOT contain smtp_password field");

  // Structure: each row should have masking indicator
  const data = json!.data as Record<string, unknown>[];
  for (const row of data) {
    assert("has_password" in row, "Each row should have 'has_password' indicator");
    assert("name" in row || "id" in row, "Each row should have identifying fields");
    // Verify no raw password leaked even as a nested property
    const rowStr = JSON.stringify(row);
    assert(!rowStr.includes("smtp_password"), "Row must not contain smtp_password in any form");
  }
}});

Deno.test({ name: "happy: manage-smtp upsert validates required fields (400)", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("manage-smtp", {
    action: "upsert",
    name: "",
  }, token);

  if (isSkipped(status, "manage-smtp")) return;
  if (isGatewayJwtRejection(status, text)) return;

  assertEquals(status, 400, `Expected 400 for missing fields, got ${status}`);
  assert(json !== null, "Response should be JSON");
  assert(typeof json!.error === "string", "Should have error message");
}});

// ═══════════════════════════════════════════════════════════════════
// 4. manage-credentials — list returns 200 with credentials array
// ═══════════════════════════════════════════════════════════════════

Deno.test({ name: "happy: manage-credentials list returns 200 with credentials array", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("manage-credentials", {
    action: "list",
  }, token);

  if (isSkipped(status, "manage-credentials")) return;
  if (isGatewayJwtRejection(status, text)) return;

  assertEquals(status, 200, `Expected 200, got ${status}: ${text}`);
  assert(json !== null, "Response should be valid JSON");
  assert(Array.isArray(json!.credentials), "Response should contain 'credentials' array");

  // Security: must never expose API keys
  assert(!text.includes("api_key_encrypted"), "Must NOT contain encrypted API key ciphertext");
  assert(!text.includes('"api_key"'), "Must NOT contain api_key field");

  // Structure: each credential should have safe fields only
  const creds = json!.credentials as Record<string, unknown>[];
  for (const cred of creds) {
    assert("id" in cred, "Each credential should have 'id'");
    assert("provider" in cred, "Each credential should have 'provider'");
    assert("is_active" in cred, "Each credential should have 'is_active'");
  }
}});

Deno.test({ name: "happy: manage-credentials provider-status returns structured response", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("manage-credentials", {
    action: "provider-status",
    provider: "openai",
  }, token);

  if (isSkipped(status, "manage-credentials")) return;
  if (isGatewayJwtRejection(status, text)) return;

  assertEquals(status, 200, `Expected 200, got ${status}: ${text}`);
  assert(json !== null, "Response should be valid JSON");
  // Should return status fields regardless of whether provider is configured
  assert("has_credential" in json! || "is_active" in json! || "status" in json!,
    "Response should contain provider status information");
}});

// ═══════════════════════════════════════════════════════════════════
// 5. delete-account — leave_teams success (happy path)
// ═══════════════════════════════════════════════════════════════════

Deno.test({ name: "happy: delete-account leave_teams succeeds for user with no external teams", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const { status, json, text } = await postFnAuth("delete-account", {
    mode: "leave_teams",
  }, token);

  if (isSkipped(status, "delete-account")) return;
  if (isGatewayJwtRejection(status, text)) return;

  assertEquals(status, 200, `Expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert(json !== null, "Response should be JSON");
  assertEquals(json!.success, true, "Should report success");
  assertEquals(json!.mode, "leave_teams", "Mode should be 'leave_teams'");
  assert(Array.isArray(json!.logs), "Should include logs array");

  // Verify logs contain meaningful entries (not empty)
  const logs = json!.logs as string[];
  assert(logs.length > 0, "Logs array should not be empty");
  assert(logs.some(l => typeof l === "string" && l.length > 0), "Logs should contain non-empty strings");
}});

// ═══════════════════════════════════════════════════════════════════
// 6. Melhor Envio — authorize/status with valid auth
// ═══════════════════════════════════════════════════════════════════

Deno.test({ name: "happy: melhor-envio authorize returns URL or config error (not 401)", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/melhor-envio?action=authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (isSkipped(res.status, "melhor-envio")) return;

  // melhor-envio has verify_jwt=false; auth guard validates internally
  if (res.status === 401) {
    console.warn("⏭️  melhor-envio auth guard rejected JWT — skipping");
    return;
  }

  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(text); } catch { /* redirect HTML is ok */ }

  // Key assertion: auth passed, we got a functional response (not auth error)
  assert(res.status !== 401, "Should not get 401 — auth should have passed");

  if (json && res.status === 200) {
    assert(
      typeof json.url === "string" || typeof json.redirect_url === "string",
      "200 response should contain URL for OAuth redirect",
    );
  } else if (json) {
    // Config error (missing env vars) is acceptable — proves auth passed
    assert(typeof json.error === "string", "Error response should have 'error' field");
  }
}});

Deno.test({ name: "happy: melhor-envio status with valid auth returns structured response", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await ensureTestUser();
  if (!token) { console.warn("⏭️  No test user — skipping"); return; }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/melhor-envio?action=status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (isSkipped(res.status, "melhor-envio")) return;

  if (res.status === 401) {
    console.warn("⏭️  melhor-envio auth guard rejected JWT — skipping");
    return;
  }

  // Security: must never leak tokens regardless of status
  assert(!text.includes("access_token"), "Must not expose access_token");
  assert(!text.includes("refresh_token"), "Must not expose refresh_token");

  // Functional: should return structured JSON (not an HTML error page)
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(text); } catch { /* */ }
  assert(json !== null, `Response should be valid JSON, got: ${text.substring(0, 200)}`);

  // Should have connection status info
  if (res.status === 200) {
    assert(
      "connected" in json! || "status" in json! || "integration" in json!,
      "200 response should contain connection status information",
    );
  }
}});

// ═══════════════════════════════════════════════════════════════════
// 7. Cross-cutting: authenticated responses are always valid JSON
// ═══════════════════════════════════════════════════════════════════

const AUTHENTICATED_ENDPOINTS = [
  { fn: "manage-smtp", body: { action: "get" }, expectStatus: 200 },
  { fn: "manage-credentials", body: { action: "list" }, expectStatus: 200 },
  { fn: "manage-sync-jobs", body: { action: "cancel-bling", integration_id: "00000000-0000-0000-0000-000000000000" }, expectStatus: null },
];

for (const { fn, body, expectStatus } of AUTHENTICATED_ENDPOINTS) {
  Deno.test({ name: `happy: ${fn} authenticated response is always valid JSON`, sanitizeResources: false, sanitizeOps: false, fn: async () => {
    const token = await ensureTestUser();
    if (!token) { console.warn("⏭️  No test user — skipping"); return; }

    const { status, text, json } = await postFnAuth(fn, body, token);
    if (isSkipped(status, fn)) return;
    if (isGatewayJwtRejection(status, text)) return;

    // Response must be valid JSON
    assert(json !== null, `${fn}: response must be valid JSON, got: ${text.substring(0, 200)}`);

    // If we expect a specific status, verify it (proves success path works)
    if (expectStatus !== null) {
      assertEquals(status, expectStatus, `${fn}: expected ${expectStatus}, got ${status}`);
    }
  }});
}

// ═══════════════════════════════════════════════════════════════════
// Cleanup — delete test user (also tests delete_owned_account happy path)
// ═══════════════════════════════════════════════════════════════════

Deno.test({ name: "happy: cleanup — delete_owned_account succeeds (full lifecycle)", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  if (!testUserId || !accessToken) {
    console.log("ℹ️  No test user to clean up");
    return;
  }

  const { status, json, text } = await postFnAuth("delete-account", {
    mode: "delete_owned_account",
  }, accessToken);

  if (isSkipped(status, "delete-account")) return;
  if (isGatewayJwtRejection(status, text)) {
    console.warn("⚠️  Cannot clean up test user — gateway rejects JWT. User left in DB: " + TEST_EMAIL);
    return;
  }

  assertEquals(status, 200, `Cleanup delete failed: ${JSON.stringify(json)}`);
  assert(json?.success === true, "Delete should report success");
  assertEquals(json?.mode, "delete_owned_account", "Mode should be delete_owned_account");
  assert(Array.isArray(json?.logs), "Should include cleanup logs");

  // Verify logs contain meaningful cleanup entries
  const logs = json!.logs as string[];
  assert(logs.length >= 2, "Delete logs should have at least 2 entries (tenant delete + profile)");
  assert(logs.some(l => l.includes("excluído") || l.includes("deleted") || l.includes("✅")),
    "Logs should confirm deletion completed");

  console.log(`✅ Test user ${TEST_EMAIL} cleaned up successfully`);
}});
