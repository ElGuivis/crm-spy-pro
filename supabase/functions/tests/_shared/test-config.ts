/**
 * Centralized test configuration.
 *
 * MIRRORS the runtime logic from `_shared/frontend-config.ts` exactly.
 * Origins are resolved from env vars — no unconditional localhost.
 *
 * In CI, the env vars are loaded from .env via dotenv/load.ts.
 */

const env = (key: string): string => (Deno.env.get(key) || "").trim();

export const SUPABASE_URL = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");
export const SUPABASE_ANON_KEY = env("VITE_SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_ANON_KEY");

// ── Flags — same logic as frontend-config.ts ────────────────────────────────
export const PREVIEW_ENABLED: boolean = env("ALLOW_PREVIEW_ORIGINS") === "true";
export const LOCALHOST_ENABLED: boolean = env("ALLOW_LOCALHOST") === "true" || PREVIEW_ENABLED;

/**
 * Build the list of allowed origins from env vars,
 * exactly matching `_shared/frontend-config.ts → buildAllowedOrigins()`.
 */
export function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  const frontendUrl = env("FRONTEND_URL");
  if (frontendUrl) origins.push(frontendUrl);

  const alt = env("FRONTEND_URL_ALT");
  if (alt) origins.push(alt);

  const app = env("FRONTEND_URL_APP");
  if (app) origins.push(app);

  const custom = env("CUSTOM_ORIGIN");
  if (custom) origins.push(custom);

  // Localhost only when explicitly allowed — mirrors runtime behaviour
  if (LOCALHOST_ENABLED) {
    origins.push("http://localhost:5173", "http://localhost:3000");
  }

  return [...new Set(origins)];
}

export const DISALLOWED_ORIGINS = [
  "https://evil-site.com",
  "https://attacker.example.org",
  "null",
];
