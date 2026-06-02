import {
  groupLinesByBucket,
  BUCKET_SIGN,
  BUCKET_PILL_CLASS,
  type StatementBucket,
} from "./categories";
import { explainerKeyForLine } from "./explainers";

/**
 * Owner detail view-model (FC-OWNER-STATEMENTS §3). Turns raw statement lines
 * into a plain, serializable structure the (client) "How the math worked"
 * table + mobile accordion render — grouped into the six buckets, with
 * owner-view signs and compact money strings. Pure + server-safe; passing the
 * result across the server→client boundary needs no bigint.
 */

export interface ViewLine {
  description: string;
  /** Signed compact amount, e.g. "+IDR 284.6M" / "−IDR 6.8M". */
  amountText: string;
  positive: boolean;
  bold: boolean;
  explainerKey: string;
}

export interface ViewGroup {
  bucket: StatementBucket;
  /** Mockup `.sec-pill.<pill>` class (e.g. management → "mgmt"). */
  pill: string;
  label: string;
  lineCount: number;
  subtotalText: string;
  positive: boolean;
  lines: ViewLine[];
}

/** Compact money: minor units → major (÷100), then B/M/K like the mockup. */
export function compactMoney(minorMagnitude: bigint, currency: string): string {
  const major = Number(minorMagnitude < 0n ? -minorMagnitude : minorMagnitude) / 100;
  let body: string;
  if (major >= 1_000_000_000) body = `${(major / 1_000_000_000).toFixed(1)}B`;
  else if (major >= 1_000_000) body = `${(major / 1_000_000).toFixed(1)}M`;
  else if (major >= 1_000) body = `${(major / 1_000).toFixed(0)}K`;
  else body = major.toLocaleString();
  return `${currency} ${body}`;
}

function signedText(bucket: StatementBucket, minor: bigint, currency: string): string {
  const positive = BUCKET_SIGN[bucket] === 1;
  return `${positive ? "+" : "−"}${compactMoney(minor, currency)}`;
}

export interface StatementLineInput {
  lineType: string | null;
  category?: string | null;
  description: string;
  amountMinor: bigint;
}

/** Build the grouped six-bucket view from owner-visible statement lines. */
export function buildStatementView(
  lines: StatementLineInput[],
  currency: string,
): ViewGroup[] {
  const groups = groupLinesByBucket(lines, (l) => l.amountMinor);
  return groups.map((g) => {
    const positive = BUCKET_SIGN[g.bucket] === 1;
    return {
      bucket: g.bucket,
      pill: BUCKET_PILL_CLASS[g.bucket],
      label: g.label,
      lineCount: g.lines.length,
      subtotalText: signedText(g.bucket, g.subtotalMinor, currency),
      positive,
      lines: g.lines.map((l, i) => ({
        description: l.description,
        amountText: signedText(g.bucket, l.amountMinor, currency),
        positive,
        // Mockup bolds the lead revenue line ("Bookings · 19 nights").
        bold: g.bucket === "revenue" && i === 0,
        explainerKey: explainerKeyForLine(l),
      })),
    };
  });
}
