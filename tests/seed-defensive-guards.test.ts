/**
 * seed.sql defensive-guards audit.
 *
 * Regression test for the "silent skip → loud fail downstream" class of
 * bug. Background: the original guest_service_orders DO block referenced
 * a guest_stay_token that was created by a *previous* DO block whose
 * BEGIN body returned early when its prerequisite booking was missing.
 * On a fresh database where the upstream booking was absent, the token
 * was silently skipped and the orders block then failed with an FK
 * violation 200+ lines downstream.
 *
 * The fix:
 *   1) every DO block that INSERTs into a table with an FK column
 *      pointing to *another seeded row* in this file must guard the
 *      block body with `IF NOT EXISTS (...) THEN RAISE NOTICE ...; RETURN; END IF;`,
 *   2) every INSERT inside a DO block must carry an `ON CONFLICT … DO NOTHING`
 *      (or `DO UPDATE`) clause so the block is idempotent.
 *
 * This test parses `drizzle/seed.sql`, finds every `DO $$ … END $$;` block,
 * and asserts both invariants. There is a small allow-list of blocks that
 * insert reference data with no external FKs (notification templates etc.)
 * — adding to the allow-list requires a comment explaining why.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEED_PATH = resolve(process.cwd(), "drizzle/seed.sql");
const SRC = readFileSync(SEED_PATH, "utf-8");

interface DoBlock {
  startLine: number;
  endLine: number;
  body: string;
}

function extractDoBlocks(src: string): DoBlock[] {
  const lines = src.split("\n");
  const blocks: DoBlock[] = [];
  let inBlock = false;
  let start = 0;
  let body: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (!inBlock && /^DO \$\$/.test(t)) {
      inBlock = true;
      start = i + 1;
      body = [t];
      continue;
    }
    if (inBlock) {
      body.push(t);
      if (/^END \$\$;?\s*$/.test(t)) {
        blocks.push({ startLine: start, endLine: i + 1, body: body.join("\n") });
        inBlock = false;
      }
    }
  }
  return blocks;
}

const BLOCKS = extractDoBlocks(SRC);

/**
 * Allow-list: blocks that insert reference data with no external FK to
 * another seeded row. Each entry is the START line; the comment
 * explains why a guard isn't required.
 */
const NO_GUARD_REQUIRED: Record<number, string> = {
  1054: "notification_templates — reference data, no FK to dynamic seeded rows",
  1107: "ai_assistant_runs + ai_operations_summaries — both rows created in the same block, only self-FK between them",
};

const HAS_GUARD = /\bIF\s+(NOT\s+)?EXISTS\b|\bIF\s+\w[\w\.]*\s+IS\s+(NOT\s+)?NULL/i;
const HAS_RETURN = /\bRETURN;/;

test("seed.sql parses into DO blocks", () => {
  assert.ok(BLOCKS.length > 0, "expected to find at least one DO block");
});

test("seed.sql has more than 25 DO blocks (sanity check)", () => {
  assert.ok(
    BLOCKS.length >= 25,
    `expected ≥25 DO blocks, found ${BLOCKS.length}`,
  );
});

for (const b of BLOCKS) {
  const allowReason = NO_GUARD_REQUIRED[b.startLine];
  if (allowReason) continue;

  test(`DO block @${b.startLine} has a defensive existence guard`, () => {
    assert.ok(
      HAS_GUARD.test(b.body),
      `DO block at line ${b.startLine}-${b.endLine} has no guard. Add 'IF NOT EXISTS (...) THEN RETURN; END IF;' or, if no guard is needed, an entry in NO_GUARD_REQUIRED in this test file.`,
    );
  });

  test(`DO block @${b.startLine} skips inserts when guard fails`, () => {
    // Two valid patterns:
    //   (a) top-of-block guard with RETURN; — block-level skip
    //   (b) per-INSERT IF EXISTS (...) THEN INSERT ...; END IF; — row-level skip
    // Either is acceptable; we just need at least one of them.
    const blockLevelSkip = HAS_RETURN.test(b.body);
    const perInsertSkip = /IF\s+(NOT\s+)?EXISTS[\s\S]*?THEN[\s\S]*?INSERT INTO/i.test(
      b.body,
    );
    assert.ok(
      blockLevelSkip || perInsertSkip,
      `DO block at line ${b.startLine}-${b.endLine} has a guard but never skips: needs either RETURN; (block-level) or per-INSERT IF EXISTS (...) THEN INSERT (row-level).`,
    );
  });
}

test("every DO block is idempotent (either ON CONFLICT per INSERT, or top-of-block idempotency probe)", () => {
  // Two valid patterns for idempotency:
  //   (a) every INSERT has an ON CONFLICT clause, OR
  //   (b) the block opens with `IF EXISTS (SELECT 1 FROM <target> WHERE …) THEN RETURN; END IF;`
  //       where <target> matches one of the INSERTed tables (probe-and-skip).
  const offenders: string[] = [];
  for (const b of BLOCKS) {
    const insertedTables = [
      ...new Set(
        [...b.body.matchAll(/INSERT INTO\s+([a-zA-Z_]+)/g)].map((m) => m[1]),
      ),
    ];
    const inserts = (b.body.match(/INSERT INTO\s+[a-zA-Z_]+/g) ?? []).length;
    const conflicts = (b.body.match(/ON CONFLICT/g) ?? []).length;
    if (conflicts >= inserts) continue;

    // Pattern (b): probe-and-skip on one of the inserted tables.
    const probeAndSkip = insertedTables.some((t) =>
      new RegExp(
        `IF\\s+EXISTS\\s*\\(\\s*SELECT[\\s\\S]*?FROM\\s+${t}[\\s\\S]*?THEN[\\s\\S]*?RETURN`,
        "i",
      ).test(b.body),
    );
    if (probeAndSkip) continue;

    offenders.push(
      `  @${b.startLine}: ${inserts} INSERTs into [${insertedTables.join(", ")}] but only ${conflicts} ON CONFLICT clauses and no probe-and-skip RETURN`,
    );
  }
  assert.equal(
    offenders.length,
    0,
    `DO blocks not provably idempotent:\n${offenders.join("\n")}`,
  );
});

test("seed.sql does not reference the historical guest_service_orders typo", () => {
  // The original bug used '8eda0006-0000-…001' as the orders block's
  // token_id, but no such token was ever inserted — only the smart-lock
  // row at '8eda0006-0001-…001' uses a similar prefix. Lock it down.
  const stale = "'8eda0006-0000-0000-0000-000000000001'";
  assert.equal(
    SRC.includes(stale),
    false,
    "seed.sql contains the stale token UUID 8eda0006-0000-…001 — the orders block should reference the actually-created token at 8eda0005-0001-…001.",
  );
});

test("seed.sql header documents the defensive-guard convention", () => {
  // The header comment is what future editors read when they add a
  // new DO block. If it disappears the convention will silently rot.
  assert.match(SRC, /Defensive guard convention/);
  assert.match(SRC, /tests\/seed-defensive-guards\.test\.ts/);
});

test("guest_service_orders block references the actually-created token UUID", () => {
  // The orders block must point at the token created by the v9E DO block
  // immediately above it. Locate by content rather than line number so
  // unrelated edits to seed.sql don't break the test.
  const ordersBlock = BLOCKS.find((b) =>
    b.body.includes("INSERT INTO guest_service_orders"),
  );
  assert.ok(ordersBlock, "expected to find the guest_service_orders DO block");
  assert.match(
    ordersBlock!.body,
    /token_id\s+uuid\s*:=\s*'8eda0005-0001-0000-0000-000000000001'/,
  );
});

test("NO_GUARD_REQUIRED entries each carry a justification comment", () => {
  for (const [line, reason] of Object.entries(NO_GUARD_REQUIRED)) {
    assert.ok(
      reason.length > 20,
      `NO_GUARD_REQUIRED[${line}] needs a meaningful justification; got '${reason}'`,
    );
  }
});

// ===========================================================================
// ON CONFLICT vs partial unique-index audit
//
// Background: Postgres raises 42P10 ("there is no unique or exclusion
// constraint matching the ON CONFLICT specification") when an INSERT uses
// `ON CONFLICT (cols)` and the only matching unique index is *partial*
// (has a WHERE clause). The fix is to repeat the partial predicate on the
// ON CONFLICT clause so the planner can infer the same arbiter index.
//
// We've now hit this bug three times in three days:
//   - owner_booking_summaries (owner_id, booking_id) WHERE booking_id IS NOT NULL
//   - owner_booking_summaries (owner_id, direct_booking_request_id) WHERE …
//   - direct_booking_guest_message_threads (request_id) WHERE request_id IS NOT NULL
//
// The check below parses every CREATE UNIQUE INDEX in drizzle/*.sql and
// every uniqueIndex(...).where(...) in src/lib/db/schema/*.ts to build a
// map of partial unique indexes; then walks every ON CONFLICT clause in
// seed.sql and asserts that any clause whose target columns match a
// partial index also carries the partial predicate.
// ===========================================================================

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface PartialIndex {
  table: string;
  cols: string[];
  predicate: string;
}

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

function camelToSnake(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function loadPartialIndexes(): Map<string, PartialIndex> {
  const map = new Map<string, PartialIndex>();

  // SQL migrations — `CREATE UNIQUE INDEX … ON tbl (cols) WHERE …;`
  for (const f of walk(resolve(process.cwd(), "drizzle"), [".sql"])) {
    const src = readFileSync(f, "utf-8");
    const re =
      /CREATE\s+UNIQUE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"?[\w]+"?\s*(?:\r?\n\s*)?ON\s+"?(\w+)"?\s*\(([^)]+)\)(?:\s*WHERE\s+([\s\S]+?))?\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const table = m[1];
      const cols = m[2]
        .split(",")
        .map((c) =>
          c.trim().replace(/"/g, "").replace(/\s+(asc|desc)$/i, ""),
        );
      const pred = (m[3] || "").trim();
      if (pred) {
        map.set(`${table}|${cols.join(",")}`, { table, cols, predicate: pred });
      }
    }
  }

  // Drizzle schemas — `uniqueIndex("name").on(t.colA, t.colB).where(sql`…`)`
  for (const f of walk(resolve(process.cwd(), "src/lib/db/schema"), [".ts"])) {
    const src = readFileSync(f, "utf-8");
    const tableRe =
      /pgTable\(\s*"(\w+)"\s*,([\s\S]*?)\(t\)\s*=>\s*\[([\s\S]*?)\]\s*,?\s*\)/g;
    let tm: RegExpExecArray | null;
    while ((tm = tableRe.exec(src)) !== null) {
      const table = tm[1];
      const tableBody = tm[2];
      const indexBody = tm[3];
      // Map JS field name → SQL column name from `field: someCol("col_name", …)`.
      const fieldToColumn = new Map<string, string>();
      const fieldRe = /(\w+):\s*\w+\(\s*"(\w+)"/g;
      let fm: RegExpExecArray | null;
      while ((fm = fieldRe.exec(tableBody)) !== null) {
        fieldToColumn.set(fm[1], fm[2]);
      }
      const idxRe =
        /uniqueIndex\([^)]+\)\s*\.on\(([^)]+)\)\s*\.where\(\s*sql`([^`]+)`/g;
      let im: RegExpExecArray | null;
      while ((im = idxRe.exec(indexBody)) !== null) {
        const cols = im[1]
          .split(",")
          .map((c) => {
            const field = c.trim().replace(/^t\./, "");
            return fieldToColumn.get(field) ?? camelToSnake(field);
          });
        const pred = im[2].trim();
        map.set(`${table}|${cols.join(",")}`, { table, cols, predicate: pred });
      }
    }
  }
  return map;
}

interface ConflictClause {
  fileLine: number;
  table: string;
  cols: string[] | null;
  where: string | null;
  raw: string;
}

function findConflictClauses(seed: string): ConflictClause[] {
  // Multi-line aware: ON CONFLICT (…)? [WHERE …]? DO (NOTHING|UPDATE)
  const re =
    /ON CONFLICT\s*(?:\(\s*([^)]+?)\s*\)|ON CONSTRAINT\s+(\w+))?\s*(?:WHERE\s+([\s\S]*?))?\s*DO\s+(NOTHING|UPDATE)/gi;
  const out: ConflictClause[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(seed)) !== null) {
    const idx = m.index;
    const before = seed.slice(0, idx);
    const lineNo = before.split("\n").length;
    const insertM = [...before.matchAll(/INSERT INTO\s+(\w+)/gi)].pop();
    const table = insertM ? insertM[1] : "<unknown>";
    const cols = (m[1] || "").trim()
      ? (m[1] || "").split(",").map((c) => c.trim().replace(/"/g, ""))
      : null;
    const where = (m[3] || "").trim() || null;
    out.push({ fileLine: lineNo, table, cols, where, raw: m[0].replace(/\s+/g, " ") });
  }
  return out;
}

const PARTIAL_INDEXES = loadPartialIndexes();
const CONFLICTS = findConflictClauses(SRC);

test("partial-index audit: at least one partial unique index exists in schema (sanity)", () => {
  assert.ok(PARTIAL_INDEXES.size >= 30, `expected ≥30 partial unique indexes, found ${PARTIAL_INDEXES.size}`);
});

test("partial-index audit: at least 100 ON CONFLICT clauses in seed.sql (sanity)", () => {
  assert.ok(CONFLICTS.length >= 100, `expected ≥100 ON CONFLICT clauses, found ${CONFLICTS.length}`);
});

test("every ON CONFLICT clause whose columns match a partial unique index also carries the partial predicate", () => {
  const offenders: string[] = [];
  for (const c of CONFLICTS) {
    if (!c.cols) continue;
    const key = `${c.table}|${c.cols.join(",")}`;
    const idx = PARTIAL_INDEXES.get(key);
    if (!idx) continue;
    if (!c.where) {
      offenders.push(
        `  L${c.fileLine}: ${c.table} ON CONFLICT (${c.cols.join(", ")}) — needs WHERE ${idx.predicate}`,
      );
    }
  }
  assert.equal(
    offenders.length,
    0,
    `ON CONFLICT clauses missing partial-index WHERE (PG error 42P10):\n${offenders.join("\n")}`,
  );
});

test("seed.sql header documents the partial-index ON CONFLICT pattern", () => {
  // Future editors must see this when they grep for ON CONFLICT pitfalls.
  assert.match(SRC, /ON CONFLICT and partial unique indexes/);
  assert.match(SRC, /42P10/);
});

test("the previously-failing direct_booking_guest_message_threads (request_id) clause now carries WHERE", () => {
  // Lock down the specific bug from day 3 of the seed-fix saga.
  const clause = CONFLICTS.find(
    (c) =>
      c.table === "direct_booking_guest_message_threads" &&
      c.cols?.length === 1 &&
      c.cols[0] === "request_id",
  );
  assert.ok(clause, "expected to find the direct_booking_guest_message_threads (request_id) ON CONFLICT clause");
  assert.match(
    clause!.where ?? "",
    /request_id\s+IS\s+NOT\s+NULL/i,
    "the partial unique index is WHERE request_id IS NOT NULL — the ON CONFLICT must repeat that predicate",
  );
});

test("the owner_booking_summaries (owner_id, booking_id) clauses still carry WHERE booking_id IS NOT NULL", () => {
  // Lock down the day-2 fix so we don't regress it during a later refactor.
  const matching = CONFLICTS.filter(
    (c) =>
      c.table === "owner_booking_summaries" &&
      c.cols?.join(",") === "owner_id,booking_id",
  );
  assert.ok(matching.length >= 5, `expected at least 5 such clauses, found ${matching.length}`);
  for (const c of matching) {
    assert.match(
      c.where ?? "",
      /booking_id\s+IS\s+NOT\s+NULL/i,
      `clause at L${c.fileLine} is missing WHERE booking_id IS NOT NULL`,
    );
  }
});
