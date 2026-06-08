/**
 * Double-entry invariants for the GL foundation (pure, no DB).
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const ORG = "00000000-0000-0000-0000-000000000001";

test("a balanced 2-line entry validates and normalizes", async () => {
  const { validateJournalEntry } = await import(
    "../src/lib/development/server/general-ledger/journal-validation"
  );
  const lines = validateJournalEntry({
    organizationId: ORG,
    entryDate: "2026-06-08",
    lines: [
      { accountCode: "1000", debitMinor: 10_000n },
      { accountCode: "4000", creditMinor: 10_000n },
    ],
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].debitMinor, 10_000n);
  assert.equal(lines[1].creditMinor, 10_000n);
});

test("an unbalanced entry throws", async () => {
  const { validateJournalEntry, JournalValidationError } = await import(
    "../src/lib/development/server/general-ledger/journal-validation"
  );
  assert.throws(
    () =>
      validateJournalEntry({
        organizationId: ORG,
        entryDate: "2026-06-08",
        lines: [
          { accountCode: "1000", debitMinor: 10_000n },
          { accountCode: "4000", creditMinor: 9_000n },
        ],
      }),
    JournalValidationError,
  );
});

test("a line with both debit and credit nonzero throws", async () => {
  const { validateJournalEntry } = await import(
    "../src/lib/development/server/general-ledger/journal-validation"
  );
  assert.throws(() =>
    validateJournalEntry({
      organizationId: ORG,
      entryDate: "2026-06-08",
      lines: [
        { accountCode: "1000", debitMinor: 10_000n, creditMinor: 10_000n },
        { accountCode: "4000", creditMinor: 10_000n },
      ],
    }),
  );
});

test("fewer than 2 lines throws", async () => {
  const { validateJournalEntry } = await import(
    "../src/lib/development/server/general-ledger/journal-validation"
  );
  assert.throws(() =>
    validateJournalEntry({
      organizationId: ORG,
      entryDate: "2026-06-08",
      lines: [{ accountCode: "1000", debitMinor: 10_000n }],
    }),
  );
});

test("negative amounts throw", async () => {
  const { validateJournalEntry } = await import(
    "../src/lib/development/server/general-ledger/journal-validation"
  );
  assert.throws(() =>
    validateJournalEntry({
      organizationId: ORG,
      entryDate: "2026-06-08",
      lines: [
        { accountCode: "1000", debitMinor: -10_000n },
        { accountCode: "4000", creditMinor: -10_000n },
      ],
    }),
  );
});

test("a multi-line balanced entry (split) validates", async () => {
  const { validateJournalEntry } = await import(
    "../src/lib/development/server/general-ledger/journal-validation"
  );
  const lines = validateJournalEntry({
    organizationId: ORG,
    entryDate: "2026-06-08",
    lines: [
      { accountCode: "5000", debitMinor: 8_000n },
      { accountCode: "2300", debitMinor: 2_000n },
      { accountCode: "2000", creditMinor: 10_000n },
    ],
  });
  assert.equal(lines.length, 3);
});
