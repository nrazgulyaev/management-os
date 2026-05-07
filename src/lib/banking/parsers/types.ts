/**
 * Stage 6.P3.B — Shared statement-parser types.
 *
 * Pure types — no DB, no I/O. The parsers under this directory take
 * a string (file content) and return a list of normalized rows that
 * the import pipeline can dedupe + insert into `bank_transactions`.
 *
 * Each parser also returns a `ParseDiagnostics` envelope so the
 * import wizard can render a useful preview / error report before
 * the operator commits the rows.
 */

import type { BankTransactionRecord } from "../types";

// ---------------------------------------------------------------------------
// Output shape — what every parser produces
// ---------------------------------------------------------------------------

/**
 * Partial because parsers vary in what they can extract — a CSV row
 * might omit `valueDate`, a PDF row might omit `counterpartyIban`.
 * The import pipeline upgrades these to full BankTransactionRecord
 * after dedupe + auto-categorization.
 */
export type ParsedStatementRow = Partial<BankTransactionRecord> & {
  /** Always present — the idempotency key for the import. CSV parsers
   *  synthesize one when the source row has none. */
  externalTransactionId: string;
  transactionDate: Date;
  amountMinor: bigint;
  currency: string;
  description: string;
  rawPayload: Record<string, unknown>;
};

export interface ParseDiagnostics {
  /** Total rows examined (pre-skip). */
  totalRowsExamined: number;
  /** Rows that successfully parsed. */
  rowsParsed: number;
  /** Rows skipped — empty, comments, header repeats. */
  rowsSkipped: number;
  /** Per-row failures with row index + reason. Kept short for the UI. */
  rowsFailed: Array<{ rowIndex: number; reason: string }>;
  /** When inferable from the source: earliest transactionDate. */
  periodStart?: Date;
  /** When inferable: latest transactionDate. */
  periodEnd?: Date;
  /** Parser-specific notes — e.g. detected dialect for CSV. */
  notes?: Record<string, unknown>;
}

export interface ParseResult {
  rows: ParsedStatementRow[];
  diagnostics: ParseDiagnostics;
}

// ---------------------------------------------------------------------------
// Common helpers reused by every parser
// ---------------------------------------------------------------------------

/** Parses an amount-as-string into a `bigint` minor-unit value.
 *
 * Handles:
 *   - Standard format ("1,234.56") and European format ("1.234,56").
 *   - Optional leading sign (+ / -) and parenthesized negatives ("(123.45)").
 *   - Optional currency symbols stripped.
 *   - Optional minor-unit precision override (default 2 decimals).
 *
 * Returns null for unparseable input. The caller decides whether
 * unparseable amounts skip the row or fail the import.
 */
export function parseAmountToMinor(
  raw: string,
  opts: {
    format?: "standard" | "european";
    decimals?: number;
  } = {},
): bigint | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Strip currency symbols + whitespace.
  let s = trimmed.replace(/[\s ]/g, "").replace(/[$€£¥₹Rp]/g, "");

  // Parenthesized negative: "(123.45)" → "-123.45".
  let isNegative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    isNegative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    isNegative = !isNegative;
    s = s.slice(1);
  }
  if (!s) return null;

  const decimals = opts.decimals ?? 2;
  const format = opts.format ?? autoDetectAmountFormat(s);

  // Normalize separators → "1234.56" form.
  let normalized: string;
  if (format === "european") {
    // "1.234,56" → "1234.56".
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // "1,234.56" → "1234.56".
    normalized = s.replace(/,/g, "");
  }

  // Reject anything that's still not a clean number.
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const dotIdx = normalized.indexOf(".");
  let intPart: string;
  let fracPart: string;
  if (dotIdx === -1) {
    intPart = normalized;
    fracPart = "0".repeat(decimals);
  } else {
    intPart = normalized.slice(0, dotIdx);
    fracPart = normalized.slice(dotIdx + 1);
    // Pad / trim to `decimals` digits.
    if (fracPart.length < decimals) fracPart = fracPart.padEnd(decimals, "0");
    else if (fracPart.length > decimals) fracPart = fracPart.slice(0, decimals);
  }
  const minor = BigInt(intPart + fracPart);
  return isNegative ? -minor : minor;
}

/**
 * Heuristic detector. The most reliable signal is the position of the
 * last separator: if the input ends with a comma followed by 1-2
 * digits and an earlier dot (e.g. "1.234,56") → european.
 */
export function autoDetectAmountFormat(raw: string): "standard" | "european" {
  const s = raw.replace(/[\s ]/g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastComma > lastDot) return "european";
  return "standard";
}

/**
 * Parse a date in any of these formats, in priority order:
 *   - ISO yyyy-mm-dd
 *   - yyyy/mm/dd
 *   - dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy (European)
 *   - mm/dd/yyyy (US — only when day is unambiguously > 12)
 *
 * Returns null on unparseable input. The caller is responsible for
 * deciding which format the column carries — usually inferred during
 * preview from a sample row.
 */
export function parseDateFlexible(
  raw: string,
  preferredFormat?:
    | "iso"
    | "ymd_slash"
    | "dmy_slash"
    | "dmy_dash"
    | "dmy_dot"
    | "mdy_slash",
): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO: 2026-05-07 (or 2026-05-07T...)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso && (!preferredFormat || preferredFormat === "iso")) {
    return makeDate(iso[1], iso[2], iso[3]);
  }
  // y/m/d
  const ymdSlash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlash) return makeDate(ymdSlash[1], ymdSlash[2], ymdSlash[3]);

  // d/m/y or d-m-y or d.m.y — preferred European default.
  const dmy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (dmy) {
    const [, a, b, y] = dmy;
    if (preferredFormat === "mdy_slash") {
      return makeDate(y, a, b);
    }
    // Default: dmy. If the day clearly > 12, also accept as dmy.
    return makeDate(y, b, a);
  }

  // d/m/yy short year
  const dmyShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (dmyShort) {
    const [, a, b, y] = dmyShort;
    const yyyy = Number(y) > 50 ? `19${y}` : `20${y}`;
    return makeDate(yyyy, b, a);
  }

  return null;
}

function makeDate(y: string, m: string, d: string): Date | null {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (
    !Number.isInteger(yy) ||
    !Number.isInteger(mm) ||
    !Number.isInteger(dd) ||
    mm < 1 ||
    mm > 12 ||
    dd < 1 ||
    dd > 31
  ) {
    return null;
  }
  // Construct via UTC to avoid local-tz drift on midnight dates.
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  if (isNaN(date.getTime())) return null;
  return date;
}

/** Synthesize a stable transaction ID when the source row lacks one.
 *  Hash-style: `${source}:${YYYY-MM-DD}:${amountMinor}:${descSlug}`. */
export function synthesizeTransactionId(input: {
  source: string;
  date: Date;
  amountMinor: bigint;
  description: string;
}): string {
  const isoDate = input.date.toISOString().slice(0, 10);
  const slug = (input.description ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "no_desc";
  return `${input.source}:${isoDate}:${input.amountMinor.toString()}:${slug}`;
}
