#!/usr/bin/env -S deno run --allow-read

// Edge Function Contract Auditor v2
//
// Cross-references:
//   1. Functions on disk
//   2. Classification in FUNCTION_CLASSIFICATION.md
//   3. Auth guard usage in code
//   4. Config in supabase/config.toml
//   5. Frontend invocations
//
// Strict semantic rules:
//   - AUTHENTICATED → must use requireUserAuth (or manual JWT). Never internal/hybrid guard.
//   - HYBRID → must use requireUserOrInternalAuth. Never requireUserAuth-only or requireInternalAuth-only.
//   - INTERNAL → must use requireInternalAuth. Never user or hybrid guard.
//   - PUBLIC → must NOT use any auth guard (validates via signature/token/state).
//   - verify_jwt: AUTHENTICATED → true; HYBRID/INTERNAL/PUBLIC → false.
//
// Exits with code 1 if any blocking violation is found.

// ── helpers ──────────────────────────────────────────────────────────────────

async function readText(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return "";
  }
}

async function listFunctionDirs(): Promise<string[]> {
  const dirs: string[] = [];
  for await (const entry of Deno.readDir("supabase/functions")) {
    if (entry.isDirectory && !entry.name.startsWith("_") && !entry.name.startsWith(".")) {
      try {
        await Deno.stat(`supabase/functions/${entry.name}/index.ts`);
        dirs.push(entry.name);
      } catch {
        // no index.ts — skip
      }
    }
  }
  return dirs.sort();
}

// ── parse FUNCTION_CLASSIFICATION.md ─────────────────────────────────────────

type FnClass = "AUTHENTICATED" | "HYBRID" | "INTERNAL" | "PUBLIC";

function parseClassification(md: string): Map<string, FnClass> {
  const map = new Map<string, FnClass>();
  let currentClass: FnClass | null = null;

  for (const line of md.split("\n")) {
    if (/## 🔒 AUTHENTICATED/.test(line)) currentClass = "AUTHENTICATED";
    else if (/## 🔄 HYBRID/.test(line)) currentClass = "HYBRID";
    else if (/## 🔧 INTERNAL/.test(line)) currentClass = "INTERNAL";
    else if (/## 🌐 PUBLIC/.test(line)) currentClass = "PUBLIC";
    else if (/^## (?:Enforcement|Rules)/.test(line)) currentClass = null;

    if (!currentClass) continue;

    const match = line.match(/^\|\s*([a-z][a-z0-9-]+)\s*\|/);
    if (match) {
      map.set(match[1], currentClass);
    }
  }
  return map;
}

// ── parse config.toml ────────────────────────────────────────────────────────

function parseConfigToml(toml: string): Map<string, boolean> {
  const map = new Map<string, boolean>();
  let currentFn: string | null = null;

  for (const line of toml.split("\n")) {
    const fnMatch = line.match(/^\[functions\.([a-z][a-z0-9-]+)\]/);
    if (fnMatch) {
      currentFn = fnMatch[1];
      continue;
    }
    if (currentFn) {
      const jwtMatch = line.match(/verify_jwt\s*=\s*(true|false)/);
      if (jwtMatch) {
        map.set(currentFn, jwtMatch[1] === "true");
        currentFn = null;
      }
    }
  }
  return map;
}

// ── detect guard usage in code ───────────────────────────────────────────────

type GuardType = "requireUserAuth" | "requireUserOrInternalAuth" | "requireInternalAuth" | "manual" | "none";

async function detectGuard(fnName: string): Promise<{ guard: GuardType; hasStatePath: boolean }> {
  const code = await readText(`supabase/functions/${fnName}/index.ts`);
  if (!code) return { guard: "none", hasStatePath: false };

  // Detect state-based auth paths (OAuth callbacks, redirect handlers)
  const hasStatePath = /oauth_states|state_record|redirect_callback|exchange/.test(code)
    && /\.from\(["']oauth_states["']\)/.test(code);

  let guard: GuardType;
  if (code.includes("requireUserOrInternalAuth")) guard = "requireUserOrInternalAuth";
  else if (code.includes("requireUserAuth")) guard = "requireUserAuth";
  else if (code.includes("requireInternalAuth")) guard = "requireInternalAuth";
  else if (code.includes("auth.getUser") || code.includes("getClaims")) guard = "manual";
  else guard = "none";

  return { guard, hasStatePath };
}

// ── find frontend invocations ────────────────────────────────────────────────

import { walk } from "https://deno.land/std@0.220.0/fs/walk.ts";

async function findFrontendInvocations(): Promise<Set<string>> {
  const invoked = new Set<string>();
  const pattern = /functions\.invoke\(\s*['"]([a-z][a-z0-9?_-]+)['"]/g;
  const urlPattern = /\/functions\/v1\/([a-z][a-z0-9_-]+)/g;

  for await (const entry of walk("src", { exts: [".ts", ".tsx"] })) {
    if (!entry.isFile) continue;
    const content = await Deno.readTextFile(entry.path);
    for (const m of content.matchAll(pattern)) {
      invoked.add(m[1].split("?")[0]);
    }
    for (const m of content.matchAll(urlPattern)) {
      invoked.add(m[1]);
    }
  }
  return invoked;
}

// ── expected guard per classification ────────────────────────────────────────

const EXPECTED_GUARDS: Record<FnClass, GuardType[]> = {
  AUTHENTICATED: ["requireUserAuth", "manual"],
  HYBRID: ["requireUserOrInternalAuth", "requireUserAuth", "manual"],
  INTERNAL: ["requireInternalAuth"],
  PUBLIC: ["none", "manual"], // PUBLIC may do signature checks counted as "manual"
};

const EXPECTED_JWT: Record<FnClass, boolean | null> = {
  AUTHENTICATED: true,
  HYBRID: null,  // HYBRID can be true (gateway-protected) or false (open-gateway)
  INTERNAL: false,
  PUBLIC: false,
};

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const errors: string[] = [];
  const warnings: string[] = [];

  const diskFunctions = await listFunctionDirs();
  const classificationMd = await readText("supabase/functions/_shared/FUNCTION_CLASSIFICATION.md");
  const classification = parseClassification(classificationMd);
  const configToml = await readText("supabase/config.toml");
  const tomlConfig = parseConfigToml(configToml);
  const frontendInvocations = await findFrontendInvocations();

  // Build guard map
  const guardMap = new Map<string, { guard: GuardType; hasStatePath: boolean }>();
  for (const fn of diskFunctions) {
    guardMap.set(fn, await detectGuard(fn));
  }

  console.log(`\n📋 Edge Function Contract Audit v2`);
  console.log(`   Functions on disk: ${diskFunctions.length}`);
  console.log(`   Classified: ${classification.size}`);
  console.log(`   In config.toml: ${tomlConfig.size}`);
  console.log(`   Frontend invocations: ${frontendInvocations.size}\n`);

  // ── Check 1: Every function must be classified ──
  for (const fn of diskFunctions) {
    if (!classification.has(fn)) {
      errors.push(`UNCLASSIFIED: "${fn}" exists on disk but not in FUNCTION_CLASSIFICATION.md`);
    }
  }

  for (const [fn] of classification) {
    if (!diskFunctions.includes(fn)) {
      warnings.push(`STALE_CLASSIFICATION: "${fn}" listed in classification but no function on disk`);
    }
  }

  // ── Check 2: Every function must have config.toml entry ──
  for (const fn of diskFunctions) {
    if (!tomlConfig.has(fn)) {
      errors.push(`MISSING_CONFIG: "${fn}" has no config.toml entry — every function MUST be declared`);
    }
  }

  for (const [fn] of tomlConfig) {
    if (!diskFunctions.includes(fn)) {
      warnings.push(`STALE_CONFIG: "${fn}" in config.toml but no function on disk`);
    }
  }

  // ── Check 3: Strict guard-vs-classification match ──
  for (const fn of diskFunctions) {
    const cls = classification.get(fn);
    const { guard, hasStatePath } = guardMap.get(fn)!;

    if (!cls) continue; // already reported as unclassified

    const allowed = EXPECTED_GUARDS[cls];
    if (!allowed.includes(guard)) {
      errors.push(
        `GUARD_MISMATCH: "${fn}" is ${cls} but uses ${guard || "no guard"} — ` +
        `expected one of: [${allowed.join(", ")}]`
      );
    }

    // Extra: AUTHENTICATED must NEVER use hybrid or internal guards
    if (cls === "AUTHENTICATED") {
      if (guard === "requireUserOrInternalAuth") {
        errors.push(
          `SEMANTIC_VIOLATION: "${fn}" is AUTHENTICATED but uses requireUserOrInternalAuth — ` +
          `reclassify as HYBRID or change guard to requireUserAuth`
        );
      }
      if (guard === "requireInternalAuth") {
        errors.push(
          `SEMANTIC_VIOLATION: "${fn}" is AUTHENTICATED but uses requireInternalAuth — ` +
          `reclassify as INTERNAL or change guard to requireUserAuth`
        );
      }
    }

    // Extra: INTERNAL must NEVER use user-facing guards
    if (cls === "INTERNAL") {
      if (guard === "requireUserAuth") {
        errors.push(
          `SEMANTIC_VIOLATION: "${fn}" is INTERNAL but uses requireUserAuth — ` +
          `reclassify as AUTHENTICATED or change guard to requireInternalAuth`
        );
      }
      if (guard === "requireUserOrInternalAuth") {
        errors.push(
          `SEMANTIC_VIOLATION: "${fn}" is INTERNAL but uses requireUserOrInternalAuth — ` +
          `reclassify as HYBRID or change guard to requireInternalAuth`
        );
      }
    }

    // Extra: HYBRID using single-sided guards
    if (cls === "HYBRID") {
      if (guard === "requireUserAuth" && !hasStatePath) {
        // HYBRID with requireUserAuth but no state-based path → likely misclassified
        warnings.push(
          `NARROW_GUARD: "${fn}" is HYBRID but uses requireUserAuth with no state-based path — ` +
          `consider requireUserOrInternalAuth or reclassify as AUTHENTICATED`
        );
      }
      if (guard === "requireInternalAuth") {
        errors.push(
          `GUARD_MISMATCH: "${fn}" is HYBRID but uses requireInternalAuth (no user path) — ` +
          `reclassify as INTERNAL or change guard to requireUserOrInternalAuth`
        );
      }
    }
  }

  // ── Check 4: verify_jwt must match classification ──
  for (const fn of diskFunctions) {
    const cls = classification.get(fn);
    const jwtEnabled = tomlConfig.get(fn);

    if (!cls || jwtEnabled === undefined) continue;

    const expected = EXPECTED_JWT[cls];
    // HYBRID allows both true and false (null = skip check)
    if (expected !== null && jwtEnabled !== expected) {
      errors.push(
        `JWT_MISMATCH: "${fn}" is ${cls} — verify_jwt should be ${expected} but is ${jwtEnabled}`
      );
    }
  }

  // ── Check 5: INTERNAL functions must NOT be called from frontend ──
  for (const fn of frontendInvocations) {
    const cls = classification.get(fn);
    if (cls === "INTERNAL") {
      errors.push(
        `FRONTEND_CALLS_INTERNAL: "${fn}" is INTERNAL but invoked from frontend — reclassify as HYBRID`
      );
    }
  }

  // ── Check 6: Frontend must NOT invoke functions that don't exist on disk ──
  for (const fn of frontendInvocations) {
    if (!diskFunctions.includes(fn)) {
      errors.push(`ORPHAN_INVOKE: frontend calls "${fn}" but no such edge function exists on disk`);
    }
  }

  // ── Report ──
  if (warnings.length > 0) {
    console.log(`⚠️  ${warnings.length} warning(s):\n`);
    for (const w of warnings) {
      console.log(`  ⚠️  ${w}`);
    }
    console.log();
  }

  if (errors.length > 0) {
    console.error(`❌ ${errors.length} blocking violation(s):\n`);
    for (const e of errors) {
      console.error(`  ❌ ${e}`);
    }
    console.error("\nFix these before merging.");
    Deno.exit(1);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ All functions pass contract audit\n");
  } else {
    console.log("✅ No blocking violations (warnings only)\n");
  }
}

main();
