/**
 * Pure: human-readable fulfilment codes (e.g. "FUL-20260429-0001").
 * Code generation is deterministic given (date, sequence) and unique
 * across the run. The DB has a UNIQUE constraint on
 * `fulfilment_code`; the `randomCode` fallback is only used in tests.
 */

const CODE_PREFIX = "FUL";

export function buildFulfilmentCode(args: {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** 1-based sequence within the date. */
  sequence: number;
}): string {
  const datePart = args.date.replaceAll("-", "");
  const seq = String(Math.max(1, args.sequence)).padStart(4, "0");
  return `${CODE_PREFIX}-${datePart}-${seq}`;
}

export function todayUtcIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function randomFulfilmentSuffix(): string {
  // 8-char alphanumeric — used only as a uniqueness tail in tests
  // when we don't have a sequence counter handy.
  const a =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(4)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      : Math.random().toString(16).slice(2, 10);
  return a.toUpperCase();
}
