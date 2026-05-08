import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getAllowedOrigins,
  DISALLOWED_ORIGINS,
  PREVIEW_ENABLED,
  LOCALHOST_ENABLED,
} from "./_shared/test-config.ts";

/**
 * CORS Guard Tests
 *
 * Validates restricted CORS policy on edge functions.
 * Origins mirror the runtime logic from `_shared/frontend-config.ts`.
 *
 * Covers:
 *  1. Error responses don't use wildcard *
 *  2. Allowed origins are reflected
 *  3. Disallowed origins are NOT reflected
 *  4. OPTIONS preflight returns restricted origin
 *  5. Preview origins (*.lovable.app) honoured only when ALLOW_PREVIEW_ORIGINS=true
 *  6. Localhost honoured only when ALLOW_LOCALHOST=true or preview enabled
 */

const ALLOWED_ORIGINS = getAllowedOrigins();

// Pick an AUTHENTICATED function to test CORS on error responses
const AUTH_FUNCTION = "send-message";

function isSkipped(status: number, fnName: string): boolean {
  if (status === 503) {
    console.warn(`⏭️  ${fnName} not deployed — skipping`);
    return true;
  }
  return false;
}

async function fetchWithOrigin(origin: string, method = "POST") {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Origin": origin,
  };
  if (method === "OPTIONS") {
    headers["Access-Control-Request-Method"] = "POST";
    headers["Access-Control-Request-Headers"] = "authorization, content-type";
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${AUTH_FUNCTION}`, {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify({ conversation_id: "fake", content: "test" }) } : {}),
  });
  const text = await res.text();
  return { res, text, status: res.status };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Error responses must NOT return Access-Control-Allow-Origin: *
// ═══════════════════════════════════════════════════════════════════

Deno.test("CORS: auth error (401) does not return wildcard origin", async () => {
  const { res, status } = await fetchWithOrigin("https://evil-site.com");
  if (isSkipped(status, AUTH_FUNCTION)) return;

  const acao = res.headers.get("Access-Control-Allow-Origin");
  assertNotEquals(acao, "*", "Error response should NOT use wildcard CORS origin");
  if (acao) {
    assert(ALLOWED_ORIGINS.includes(acao), `Origin '${acao}' in error response is not in allowlist`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// 2. Allowed origins get reflected correctly in error responses
// ═══════════════════════════════════════════════════════════════════

for (const origin of ALLOWED_ORIGINS) {
  Deno.test(`CORS: allowed origin '${origin}' reflected in 401 response`, async () => {
    const { res, status } = await fetchWithOrigin(origin);
    if (isSkipped(status, AUTH_FUNCTION)) return;

    const acao = res.headers.get("Access-Control-Allow-Origin");
    assertEquals(acao, origin, `Expected origin '${origin}' to be reflected`);
  });
}

// ═══════════════════════════════════════════════════════════════════
// 3. Disallowed origins are NOT reflected
// ═══════════════════════════════════════════════════════════════════

for (const origin of DISALLOWED_ORIGINS) {
  Deno.test(`CORS: disallowed origin '${origin}' NOT reflected in response`, async () => {
    const { res, status } = await fetchWithOrigin(origin);
    if (isSkipped(status, AUTH_FUNCTION)) return;

    const acao = res.headers.get("Access-Control-Allow-Origin");
    assertNotEquals(acao, origin, `Disallowed origin '${origin}' should NOT be reflected`);
    assertNotEquals(acao, "*", "Should not fall back to wildcard");
  });
}

// ═══════════════════════════════════════════════════════════════════
// 4. OPTIONS preflight on authenticated function returns proper CORS
// ═══════════════════════════════════════════════════════════════════

Deno.test("CORS: OPTIONS preflight returns restricted origin", async () => {
  if (ALLOWED_ORIGINS.length === 0) {
    console.warn("⏭️  No allowed origins configured — skipping");
    return;
  }
  const origin = ALLOWED_ORIGINS[0];
  const { res, status } = await fetchWithOrigin(origin, "OPTIONS");
  if (isSkipped(status, AUTH_FUNCTION)) return;

  assert(status === 200 || status === 204, `OPTIONS should return 200/204, got ${status}`);

  const acao = res.headers.get("Access-Control-Allow-Origin");
  assertNotEquals(acao, "*", "OPTIONS should not return wildcard origin");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Preview origins — honoured only when ALLOW_PREVIEW_ORIGINS=true
// ═══════════════════════════════════════════════════════════════════

const PREVIEW_ORIGIN = "https://test-preview--abc123.lovable.app";

Deno.test("CORS: preview origin reflected ONLY when ALLOW_PREVIEW_ORIGINS=true", async () => {
  const { res, status } = await fetchWithOrigin(PREVIEW_ORIGIN);
  if (isSkipped(status, AUTH_FUNCTION)) return;

  const acao = res.headers.get("Access-Control-Allow-Origin");

  if (PREVIEW_ENABLED) {
    assertEquals(acao, PREVIEW_ORIGIN, "Preview origin should be reflected when preview is enabled");
  } else {
    assertNotEquals(acao, PREVIEW_ORIGIN, "Preview origin should NOT be reflected when preview is disabled");
    assertNotEquals(acao, "*", "Should not fall back to wildcard");
  }
});

// ═══════════════════════════════════════════════════════════════════
// 6. Localhost — honoured only when ALLOW_LOCALHOST=true or preview
// ═══════════════════════════════════════════════════════════════════

const LOCALHOST_ORIGIN = "http://localhost:5173";

Deno.test("CORS: localhost origin reflected ONLY when ALLOW_LOCALHOST=true or preview enabled", async () => {
  const { res, status } = await fetchWithOrigin(LOCALHOST_ORIGIN);
  if (isSkipped(status, AUTH_FUNCTION)) return;

  const acao = res.headers.get("Access-Control-Allow-Origin");

  if (LOCALHOST_ENABLED) {
    assertEquals(acao, LOCALHOST_ORIGIN, "Localhost should be reflected when localhost is enabled");
  } else {
    assertNotEquals(acao, LOCALHOST_ORIGIN, "Localhost should NOT be reflected when disabled");
    assertNotEquals(acao, "*", "Should not fall back to wildcard");
  }
});

Deno.test("CORS: localhost:3000 reflected ONLY when localhost is enabled", async () => {
  const { res, status } = await fetchWithOrigin("http://localhost:3000");
  if (isSkipped(status, AUTH_FUNCTION)) return;

  const acao = res.headers.get("Access-Control-Allow-Origin");

  if (LOCALHOST_ENABLED) {
    assertEquals(acao, "http://localhost:3000", "localhost:3000 should be reflected when enabled");
  } else {
    assertNotEquals(acao, "http://localhost:3000", "localhost:3000 should NOT be reflected when disabled");
  }
});
