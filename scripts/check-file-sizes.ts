#!/usr/bin/env -S deno run --allow-read

/**
 * File Size Checker
 * Detects source files exceeding recommended line limits.
 * Runs in CI as a quality gate (not warning-only).
 *
 * Exit behaviour:
 *   - Code 1 when any file exceeds 150% of its limit (critical violation).
 *   - Code 1 (CI only) when an already-over-limit file grew since the last snapshot.
 *   - Code 0 otherwise (non-critical violations are warnings only).
 *
 * Outputs GitHub Actions annotations when running in CI.
 * See src/FILE_SIZE_RULES.md for limits, tiers, and decomposition backlog.
 */

import { walk } from "https://deno.land/std@0.220.0/fs/walk.ts";

const LIMITS: Record<string, number> = {
  "src/pages/": 400,
  "src/components/": 250,
  "src/hooks/": 200,
  "supabase/functions/": 500,
  "src/lib/": 150,
};

const SKIP = ["node_modules", ".git", "dist", "build"];

// Files above this multiplier are flagged as "critical" (top refactor candidates)
const CRITICAL_MULTIPLIER = 1.5;
const TOP_N = 20;

function getLimit(path: string): number {
  for (const [prefix, limit] of Object.entries(LIMITS)) {
    if (path.startsWith(prefix)) return limit;
  }
  return 500;
}

const isCI = Deno.env.get("CI") === "true" || Deno.env.get("GITHUB_ACTIONS") === "true";

async function main() {
  const violations: { path: string; lines: number; limit: number; ratio: number }[] = [];

  for await (const entry of walk(".", {
    exts: [".ts", ".tsx"],
    skip: SKIP.map(s => new RegExp(`^${s}`)),
  })) {
    if (entry.isFile) {
      const relativePath = entry.path.replace(/^\.\//, "");
      if (relativePath.includes("_shared/")) continue;
      if (relativePath.includes(".test.")) continue;
      if (relativePath.endsWith("types.ts") && relativePath.includes("integrations")) continue;

      const content = await Deno.readTextFile(entry.path);
      const lineCount = content.split("\n").length;
      const limit = getLimit(relativePath);

      if (lineCount > limit) {
        violations.push({
          path: relativePath,
          lines: lineCount,
          limit,
          ratio: Math.round((lineCount / limit) * 100),
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log("✅ All files within size limits");
    return;
  }

  violations.sort((a, b) => b.ratio - a.ratio);

  // --- Summary header ---
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  FILE SIZE REPORT — ${violations.length} file(s) over limit`);
  console.log(`${"=".repeat(70)}\n`);

  // --- Critical violators (top refactor candidates) ---
  const critical = violations.filter(v => v.lines > v.limit * CRITICAL_MULTIPLIER);
  const topViolators = violations.slice(0, TOP_N);

  if (critical.length > 0) {
    console.log(`🔴 CRITICAL (>${Math.round(CRITICAL_MULTIPLIER * 100)}% of limit) — ${critical.length} files:\n`);
    for (const v of critical) {
      console.log(`  ${v.ratio}%  ${v.path} (${v.lines}/${v.limit} lines)`);
    }
    console.log("");
  }

  // --- Top N ---
  console.log(`📋 Top ${Math.min(TOP_N, violations.length)} violators:\n`);
  console.log("  Ratio  Lines  Limit  File");
  console.log("  -----  -----  -----  ----");
  for (const v of topViolators) {
    console.log(
      `  ${String(v.ratio).padStart(4)}%  ${String(v.lines).padStart(5)}  ${String(v.limit).padStart(5)}  ${v.path}`
    );
  }

  if (violations.length > TOP_N) {
    console.log(`\n  ... and ${violations.length - TOP_N} more files over limit.`);
  }

  // --- GitHub Actions annotations ---
  if (isCI) {
    console.log("");
    for (const v of critical) {
      console.log(`::warning file=${v.path}::File has ${v.lines} lines (limit: ${v.limit}, ${v.ratio}% of limit). Refactor candidate.`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("  ℹ️  Critical violations (>150%) block CI. See src/FILE_SIZE_RULES.md");
  console.log(`${"=".repeat(70)}\n`);

  // --- New file guard: flag files that GREW since last run ---
  const SNAPSHOT_PATH = ".lovable/file-sizes-snapshot.json";
  let snapshot: Record<string, number> = {};
  try {
    snapshot = JSON.parse(await Deno.readTextFile(SNAPSHOT_PATH));
  } catch { /* first run or missing */ }

  const grew: { path: string; was: number; now: number }[] = [];
  for (const v of violations) {
    const prev = snapshot[v.path];
    if (prev !== undefined && v.lines > prev) {
      grew.push({ path: v.path, was: prev, now: v.lines });
    }
  }

  if (grew.length > 0) {
    console.log(`\n⚠️  FILES THAT GREW (already over limit):\n`);
    for (const g of grew) {
      console.log(`  +${g.now - g.was} lines  ${g.path} (${g.was} → ${g.now})`);
      if (isCI) {
        console.log(`::warning file=${g.path}::File grew from ${g.was} to ${g.now} lines while already over limit. Extract before adding.`);
      }
    }
  }

  // Save snapshot for next run
  const newSnapshot: Record<string, number> = {};
  for (const v of violations) {
    newSnapshot[v.path] = v.lines;
  }
  try {
    await Deno.mkdir(".lovable", { recursive: true });
    await Deno.writeTextFile(SNAPSHOT_PATH, JSON.stringify(newSnapshot, null, 2));
  } catch { /* non-critical */ }

  // Exit 1 when critical violations exist — blocks CI
  if (critical.length > 0) {
    console.log("\n❌ Exiting with code 1 due to critical violations.\n");
    Deno.exit(1);
  }

  // Exit 1 if any over-limit file grew — prevents regression
  if (grew.length > 0 && isCI) {
    console.log("\n❌ Exiting with code 1: over-limit files grew. Extract before adding.\n");
    Deno.exit(1);
  }
  // Exit 0 for non-critical violations — warning only
}

main();
