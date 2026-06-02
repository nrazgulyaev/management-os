/**
 * FC-OWNER-STATEMENTS §3 — the math-decomposition contract (the owner's key
 * ask). Every statement line carries a coarse `line_type` set at generation
 * (statement-generator.ts): revenue | fee | expense | tax | reserve |
 * management_fee. The owner's "How the math worked" table groups by these into
 * exactly six buckets. The granular `category` (e.g. "airbnb", "phr",
 * "renovation_accrual") drives the per-line "why this number?" explainer.
 *
 * Pure + dependency-free so it is unit-testable and usable on both surfaces.
 */

export type StatementBucket =
  | "revenue"
  | "fees"
  | "taxes"
  | "expenses"
  | "management"
  | "reserve";

const LINE_TYPE_TO_BUCKET: Record<string, StatementBucket> = {
  revenue: "revenue",
  fee: "fees",
  tax: "taxes",
  expense: "expenses",
  reserve: "reserve",
  management_fee: "management",
};

/** Display order + label for the six buckets (mockup order). */
export const BUCKET_ORDER: readonly StatementBucket[] = [
  "revenue",
  "fees",
  "taxes",
  "expenses",
  "management",
  "reserve",
];

export const BUCKET_LABEL: Record<StatementBucket, string> = {
  revenue: "Revenue",
  fees: "Fees",
  taxes: "Taxes",
  expenses: "Expenses",
  management: "Management",
  reserve: "Reserve",
};

/** CSS pill-class per bucket — matches the mockup's `.sec-pill.<x>` names. */
export const BUCKET_PILL_CLASS: Record<StatementBucket, string> = {
  revenue: "revenue",
  fees: "fees",
  taxes: "taxes",
  expenses: "expenses",
  management: "mgmt",
  reserve: "reserves",
};

/** Owner-view sign: revenue is the only positive (+) bucket; the rest deduct. */
export const BUCKET_SIGN: Record<StatementBucket, 1 | -1> = {
  revenue: 1,
  fees: -1,
  taxes: -1,
  expenses: -1,
  management: -1,
  reserve: -1,
};

/** Map a line's `line_type` to its owner bucket. Unknown types fall to expenses. */
export function statementCategoryBucket(lineType: string | null | undefined): StatementBucket {
  return LINE_TYPE_TO_BUCKET[(lineType ?? "").trim()] ?? "expenses";
}

export interface BucketGroup<L> {
  bucket: StatementBucket;
  label: string;
  sign: 1 | -1;
  lines: L[];
  /** Sum of `amountMinor` across the group's lines. */
  subtotalMinor: bigint;
}

/**
 * Group statement lines into the six buckets in canonical order, dropping
 * empty buckets. `getAmount` returns the line's minor-unit magnitude.
 */
export function groupLinesByBucket<L extends { lineType: string | null }>(
  lines: L[],
  getAmount: (line: L) => bigint,
): BucketGroup<L>[] {
  const byBucket = new Map<StatementBucket, L[]>();
  for (const line of lines) {
    const bucket = statementCategoryBucket(line.lineType);
    const arr = byBucket.get(bucket) ?? [];
    arr.push(line);
    byBucket.set(bucket, arr);
  }
  return BUCKET_ORDER.filter((b) => byBucket.has(b)).map((bucket) => {
    const groupLines = byBucket.get(bucket)!;
    const subtotalMinor = groupLines.reduce((sum, l) => sum + getAmount(l), 0n);
    return {
      bucket,
      label: BUCKET_LABEL[bucket],
      sign: BUCKET_SIGN[bucket],
      lines: groupLines,
      subtotalMinor,
    };
  });
}
