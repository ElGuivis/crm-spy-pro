/**
 * Centralized frontend URL and origin configuration.
 *
 * ALL allowed origins and frontend URLs are resolved from environment variables.
 * No hardcoded production URLs — FRONTEND_URL is mandatory.
 *
 * Required env vars:
 *   FRONTEND_URL           — primary production frontend (e.g. "https://spypro.com.br")
 *
 * Optional env vars:
 *   FRONTEND_URL_ALT       — secondary origin  (e.g. "https://www.spypro.com.br")
 *   FRONTEND_URL_APP       — app subdomain      (e.g. "https://crmspypro.lovable.app")
 *   CUSTOM_ORIGIN          — additional origin   (e.g. custom domain)
 *   ALLOW_PREVIEW_ORIGINS  — "true" to allow *.lovable.app / *.lovableproject.com
 *   ALLOW_LOCALHOST         — "true" to allow localhost origins (dev/test only)
 */

const env = (key: string): string => {
  if (typeof Deno === "undefined") return "";
  return (Deno.env.get(key) || "").trim();
};

// ── Fail-fast if FRONTEND_URL is missing ─────────────────────────────────────
const _frontendUrl = env("FRONTEND_URL");
if (!_frontendUrl) {
  // Allow graceful degradation only during Deno test/compile where env may be absent
  if (typeof Deno !== "undefined" && Deno.env.get("SUPABASE_URL")) {
    throw new Error(
      "FATAL: FRONTEND_URL environment variable is not set. " +
      "All CORS and redirect logic depends on it. " +
      "Set it in Lovable Cloud → Secrets."
    );
  }
}

export const PRIMARY_FRONTEND_URL: string = _frontendUrl || "";

// ── Build the static allowlist from env ──────────────────────────────────────
const PREVIEW_ENABLED: boolean = env("ALLOW_PREVIEW_ORIGINS") === "true";
const LOCALHOST_ENABLED: boolean = env("ALLOW_LOCALHOST") === "true" || PREVIEW_ENABLED;

function buildAllowedOrigins(): string[] {
  const origins: string[] = [];

  if (PRIMARY_FRONTEND_URL) origins.push(PRIMARY_FRONTEND_URL);

  const alt = env("FRONTEND_URL_ALT");
  if (alt) origins.push(alt);

  const app = env("FRONTEND_URL_APP");
  if (app) origins.push(app);

  const custom = env("CUSTOM_ORIGIN");
  if (custom) origins.push(custom);

  // Localhost only when explicitly allowed (dev/test/preview)
  if (LOCALHOST_ENABLED) {
    origins.push("http://localhost:5173", "http://localhost:3000");
  }

  return [...new Set(origins)];
}

export const ALLOWED_ORIGINS: string[] = buildAllowedOrigins();

/**
 * Check whether a given origin string is in the allowlist.
 * Preview subdomains (*.lovable.app, *.lovableproject.com) are only allowed
 * when ALLOW_PREVIEW_ORIGINS=true.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  // Exact match against static list
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  // Dynamic preview subdomains (opt-in only)
  if (PREVIEW_ENABLED) {
    if (origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com")) {
      return true;
    }
  }

  return false;
}

/**
 * Validate a full URL (e.g. frontend_url from OAuth state) against the allowlist.
 * Extracts the origin portion before checking.
 */
export function isAllowedRedirectUrl(url: string): boolean {
  try {
    return isAllowedOrigin(new URL(url).origin);
  } catch {
    return false;
  }
}
