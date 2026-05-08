/**
 * check-env-secrets.ts
 * 
 * Validates that .env contains ONLY allowed prefixes (public variables).
 * Blocks CI if a private secret is accidentally added to the versioned .env.
 *
 * Allowed prefixes: VITE_
 * Allowed exact names: (none currently — extend ALLOWED_EXACT if needed)
 *
 * Usage: deno run --allow-read scripts/check-env-secrets.ts
 */

const ALLOWED_PREFIXES = ["VITE_"];
const ALLOWED_EXACT: string[] = [];

const ENV_PATH = ".env";

async function main() {
  let content: string;
  try {
    content = await Deno.readTextFile(ENV_PATH);
  } catch {
    console.log("✅ No .env file found — nothing to validate.");
    Deno.exit(0);
  }

  const violations: { line: number; key: string }[] = [];

  content.split("\n").forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return;

    const key = match[1];

    if (ALLOWED_EXACT.includes(key)) return;
    if (ALLOWED_PREFIXES.some((p) => key.startsWith(p))) return;

    violations.push({ line: idx + 1, key });
  });

  if (violations.length === 0) {
    console.log("✅ .env contains only allowed public variables.");
    Deno.exit(0);
  }

  console.error("❌ .env contains variables that are NOT allowed:\n");
  for (const v of violations) {
    console.error(`  Line ${v.line}: ${v.key}`);
  }
  console.error(
    "\nOnly variables with these prefixes are permitted in .env:",
    ALLOWED_PREFIXES.join(", ")
  );
  console.error(
    "Private secrets must go in Lovable Cloud > Secrets (see docs/ENV_POLICY.md).\n"
  );
  Deno.exit(1);
}

main();
