#!/usr/bin/env -S deno run --allow-read

/**
 * Schema Drift Detector (v3)
 *
 * Compares the generated types.ts against FULL_MIGRATION.sql snapshot across:
 *   1. Tables           (blocking)
 *   2. Columns          (blocking — ≥1 missing column is drift)
 *   3. Enums            (blocking)
 *   4. Functions (RPC)  (blocking)
 *
 * Exit code 1 = drift detected → blocks CI merge
 *
 * Run: deno run --allow-read scripts/check-schema-drift.ts
 */

const TYPES_PATH = "src/integrations/supabase/types.ts";
const SNAPSHOT_PATH = "sql/FULL_MIGRATION.sql";

// ─── SQL reserved words (never treated as identifiers) ──────────────────────
const SQL_RESERVED = new Set([
  "for", "to", "from", "select", "insert", "update", "delete", "create",
  "alter", "drop", "table", "index", "where", "and", "or", "not", "in",
  "on", "set", "values", "into", "as", "is", "null", "true", "false",
  "if", "then", "else", "end", "begin", "return", "with", "order", "by",
  "group", "having", "limit", "offset", "join", "left", "right", "inner",
  "outer", "cross", "union", "all", "exists", "between", "like", "case",
  "when", "cast", "primary", "key", "references", "foreign", "unique",
  "check", "constraint", "default", "cascade", "restrict",
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// types.ts extractors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractTypesTableNames(content: string): string[] {
  const tablesBlock = content.match(/Tables:\s*\{([\s\S]*?)^\s{4}\}/m);
  if (!tablesBlock) {
    console.error("❌ Could not locate 'Tables: {' block in types.ts");
    Deno.exit(1);
  }
  const tables: string[] = [];
  const re = /^\s{6}(\w+):\s*\{$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tablesBlock[1])) !== null) tables.push(m[1]);
  return [...new Set(tables)].sort();
}

function extractTypesColumns(content: string, tableName: string): string[] {
  const tableRe = new RegExp(
    `^\\s{6}${tableName}:\\s*\\{[\\s\\S]*?Row:\\s*\\{([\\s\\S]*?)\\}`,
    "m"
  );
  const match = content.match(tableRe);
  if (!match) return [];
  const cols: string[] = [];
  const colRe = /^\s+(\w+):/gm;
  let m: RegExpExecArray | null;
  while ((m = colRe.exec(match[1])) !== null) cols.push(m[1]);
  return cols.sort();
}

function extractTypesFunctionNames(content: string): string[] {
  const fnBlock = content.match(/Functions:\s*\{([\s\S]*?)^\s{4}\}/m);
  if (!fnBlock) return [];
  const fns: string[] = [];
  const re = /^\s{6}(\w+):\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fnBlock[1])) !== null) fns.push(m[1]);
  return [...new Set(fns)].sort();
}

function extractTypesEnumNames(content: string): string[] {
  const enumBlock = content.match(/Enums:\s*\{([\s\S]*?)^\s{4}\}/m);
  if (!enumBlock) return [];
  const enums: string[] = [];
  const re = /^\s{6}(\w+):/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(enumBlock[1])) !== null) enums.push(m[1]);
  return [...new Set(enums)].sort();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FULL_MIGRATION.sql extractors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractSnapshotTableNames(content: string): string[] {
  const alive = new Set<string>();
  for (const line of content.split("\n")) {
    const createMatch = line.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/i
    );
    if (createMatch) {
      const name = createMatch[1].toLowerCase();
      if (!SQL_RESERVED.has(name)) alive.add(name);
    }
    const dropMatch = line.match(
      /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/i
    );
    if (dropMatch) alive.delete(dropMatch[1].toLowerCase());
  }
  return [...alive].sort();
}

function extractSnapshotColumns(content: string, tableName: string): string[] {
  const re = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?${tableName}\\s*\\(([\\s\\S]*?)\\);`,
    "gi"
  );
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) lastMatch = m;
  if (!lastMatch) return [];

  const constraints = new Set(["PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "CONSTRAINT", "EXCLUDE"]);
  const cols: string[] = [];
  for (const line of lastMatch[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--")) continue;
    const wordMatch = trimmed.match(/^(\w+)/);
    if (wordMatch && !constraints.has(wordMatch[1].toUpperCase())) {
      cols.push(wordMatch[1]);
    }
  }
  return cols.sort();
}

function extractAlteredColumns(content: string, tableName: string): string[] {
  const cols: string[] = [];

  // Strategy: find all ALTER TABLE <tableName> blocks and scan their continuation
  // lines for ADD COLUMN statements (handles multi-line ALTER)
  const lines = content.split("\n");
  let inAlterBlock = false;

  for (const line of lines) {
    // Start of ALTER TABLE block for this table
    const alterStart = new RegExp(
      `ALTER\\s+TABLE\\s+(?:public\\.)?${tableName}\\b`, "i"
    );
    if (alterStart.test(line)) {
      inAlterBlock = true;
    }

    if (inAlterBlock) {
      // Match ADD COLUMN in this line
      const addMatch = line.match(
        /ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i
      );
      if (addMatch) {
        cols.push(addMatch[1]);
      }

      // End of ALTER block: semicolon terminates
      if (line.includes(";")) {
        inAlterBlock = false;
      }
    }
  }

  return cols;
}

function extractDroppedColumns(content: string, tableName: string): string[] {
  const cols: string[] = [];
  const lines = content.split("\n");
  let inAlterBlock = false;

  for (const line of lines) {
    const alterStart = new RegExp(
      `ALTER\\s+TABLE\\s+(?:public\\.)?${tableName}\\b`, "i"
    );
    if (alterStart.test(line)) inAlterBlock = true;

    if (inAlterBlock) {
      const dropMatch = line.match(
        /DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(\w+)/i
      );
      if (dropMatch) cols.push(dropMatch[1]);
      if (line.includes(";")) inAlterBlock = false;
    }
  }

  return cols;
}

function extractSnapshotFunctionNames(content: string): string[] {
  const alive = new Set<string>();
  // CREATE OR REPLACE FUNCTION public.fn_name(
  const createRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(content)) !== null) {
    alive.add(m[1].toLowerCase());
  }
  // DROP FUNCTION
  const dropRe = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
  while ((m = dropRe.exec(content)) !== null) {
    alive.delete(m[1].toLowerCase());
  }
  // Exclude trigger/internal functions that aren't exposed as RPC
  const internal = new Set([
    "handle_new_user", "handle_new_tenant_tokens", "update_updated_at_column",
    "update_li_updated_at_column", "encrypt_bling_tokens", "encrypt_melhor_envio_tokens",
    "encrypt_email_smtp_password", "encrypt_ai_credentials",
  ]);
  return [...alive].filter((f) => !internal.has(f)).sort();
}

function extractSnapshotEnumNames(content: string): string[] {
  const alive = new Set<string>();
  // CREATE TYPE public.enum_name AS ENUM
  const createRe = /CREATE\s+TYPE\s+(?:public\.)?(\w+)\s+AS\s+ENUM/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(content)) !== null) {
    alive.add(m[1].toLowerCase());
  }
  const dropRe = /DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
  while ((m = dropRe.exec(content)) !== null) {
    alive.delete(m[1].toLowerCase());
  }
  return [...alive].sort();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Drift check helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DriftResult {
  category: string;
  inTypesOnly: string[];
  inSnapshotOnly: string[];
  blocking: boolean;
}

function checkDrift(
  category: string,
  typesItems: string[],
  snapshotItems: string[],
): DriftResult {
  const inTypesOnly = typesItems.filter((t) => !snapshotItems.includes(t));
  const inSnapshotOnly = snapshotItems.filter((t) => !typesItems.includes(t));
  return {
    category,
    inTypesOnly,
    inSnapshotOnly,
    blocking: inTypesOnly.length > 0 || inSnapshotOnly.length > 0,
  };
}

function printDrift(result: DriftResult): void {
  if (!result.blocking) return;

  if (result.inTypesOnly.length > 0) {
    console.error(
      `🚨 ${result.category} in types.ts but NOT in snapshot (${result.inTypesOnly.length}):`
    );
    result.inTypesOnly.forEach((t) => console.error(`   + ${t}`));
    console.error(
      "   → Snapshot is stale. Regenerate: cat supabase/migrations/*.sql > sql/FULL_MIGRATION.sql\n"
    );
  }

  if (result.inSnapshotOnly.length > 0) {
    console.error(
      `🚨 ${result.category} in snapshot but NOT in types.ts (${result.inSnapshotOnly.length}):`
    );
    result.inSnapshotOnly.forEach((t) => console.error(`   - ${t}`));
    console.error(
      "   → May have been dropped, or snapshot contains stale definitions.\n"
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  let exitCode = 0;

  // Read files
  let typesContent: string;
  try {
    typesContent = await Deno.readTextFile(TYPES_PATH);
  } catch {
    console.error(`❌ Cannot read ${TYPES_PATH}`);
    Deno.exit(1);
  }

  let snapshotContent: string;
  try {
    snapshotContent = await Deno.readTextFile(SNAPSHOT_PATH);
  } catch {
    console.error(`❌ Cannot read ${SNAPSHOT_PATH} — snapshot is required`);
    Deno.exit(1);
  }

  // ── 1. Table-level drift ──────────────────────────────────────────────────
  const typesTables = extractTypesTableNames(typesContent);
  const snapshotTables = extractSnapshotTableNames(snapshotContent);
  console.log(`📋 Tables:    types.ts=${typesTables.length}  snapshot=${snapshotTables.length}`);

  const tableDrift = checkDrift("Tables", typesTables, snapshotTables);
  if (tableDrift.blocking) {
    printDrift(tableDrift);
    exitCode = 1;
  }

  // ── 2. Column-level drift (shared tables) ─────────────────────────────────
  const sharedTables = typesTables.filter((t) => snapshotTables.includes(t));
  let columnDriftCount = 0;
  const columnDriftDetails: string[] = [];

  for (const table of sharedTables) {
    const typesColumns = extractTypesColumns(typesContent, table);
    const baseColumns = extractSnapshotColumns(snapshotContent, table);
    const addedCols = extractAlteredColumns(snapshotContent, table);
    const droppedCols = new Set(extractDroppedColumns(snapshotContent, table));

    const snapshotCols = [
      ...new Set([...baseColumns, ...addedCols].filter((c) => !droppedCols.has(c))),
    ].sort();

    const missingInSnapshot = typesColumns.filter((c) => !snapshotCols.includes(c));

    if (missingInSnapshot.length > 0) {
      columnDriftCount++;
      columnDriftDetails.push(
        `   "${table}": ${missingInSnapshot.join(", ")}`
      );
    }
  }

  if (columnDriftCount > 0) {
    console.error(
      `\n🚨 Column drift in ${columnDriftCount} table(s) — columns in types.ts missing from snapshot:`
    );
    columnDriftDetails.forEach((d) => console.error(d));
    console.error(
      "\n   → Regenerate: cat supabase/migrations/*.sql > sql/FULL_MIGRATION.sql\n"
    );
    exitCode = 1;
  }

  // ── 3. Enum drift ─────────────────────────────────────────────────────────
  const typesEnums = extractTypesEnumNames(typesContent);
  const snapshotEnums = extractSnapshotEnumNames(snapshotContent);
  console.log(`📋 Enums:     types.ts=${typesEnums.length}  snapshot=${snapshotEnums.length}`);

  const enumDrift = checkDrift("Enums", typesEnums, snapshotEnums);
  if (enumDrift.blocking) {
    printDrift(enumDrift);
    exitCode = 1;
  }

  // ── 4. Function (RPC) drift ───────────────────────────────────────────────
  const typesFunctions = extractTypesFunctionNames(typesContent);
  const snapshotFunctions = extractSnapshotFunctionNames(snapshotContent);
  console.log(`📋 Functions: types.ts=${typesFunctions.length}  snapshot=${snapshotFunctions.length}`);

  const fnDrift = checkDrift("Functions", typesFunctions, snapshotFunctions);
  if (fnDrift.blocking) {
    printDrift(fnDrift);
    exitCode = 1;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalDrift =
    (tableDrift.inTypesOnly.length + tableDrift.inSnapshotOnly.length) +
    columnDriftCount +
    (enumDrift.inTypesOnly.length + enumDrift.inSnapshotOnly.length) +
    (fnDrift.inTypesOnly.length + fnDrift.inSnapshotOnly.length);

  console.log(`\n📊 Summary:`);
  console.log(`   Tables:      ${sharedTables.length} shared, ${tableDrift.inTypesOnly.length + tableDrift.inSnapshotOnly.length} drifted`);
  console.log(`   Columns:     ${columnDriftCount} tables with drift`);
  console.log(`   Enums:       ${enumDrift.inTypesOnly.length + enumDrift.inSnapshotOnly.length} drifted`);
  console.log(`   Functions:   ${fnDrift.inTypesOnly.length + fnDrift.inSnapshotOnly.length} drifted`);
  console.log(`   Total drift: ${totalDrift}`);

  if (exitCode === 0) {
    console.log("\n✅ No schema drift detected — tables, columns, enums and functions are in sync");
  } else {
    console.error("\n🚨 Schema drift detected! This blocks CI merge.");
    console.error("   Fix: regenerate snapshot from migrations:");
    console.error("   cat supabase/migrations/*.sql > sql/FULL_MIGRATION.sql");
    console.error("   See sql/SOURCE_OF_TRUTH.md for full guidance.");
  }

  Deno.exit(exitCode);
}

main();
