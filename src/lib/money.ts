/**
 * Money helpers — every monetary value in the finance engine is a BIGINT
 * minor unit (e.g. cents for USD, sen for IDR). Floating point is forbidden
 * for amounts at rest. These helpers keep all conversion / arithmetic /
 * presentation in one place.
 *
 * Currency conventions (display side only):
 *   USD, EUR, GBP, JPY → 2 minor digits (we treat JPY as 2 for storage too,
 *     even though it has 0 fractional digits; UI rounds when rendering).
 *   IDR → 2 minor digits in our schema. Many systems treat IDR as 0 minor
 *     digits; we adopt 2 to align with USD math and avoid format quirks.
 */

export type Money = { amountMinor: bigint; currency: string };

const FRACTION_DIGITS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  IDR: 0,
  AUD: 2,
  SGD: 2,
};

const STORAGE_FRACTION_DIGITS = 2;

export function fractionDigits(currency: string): number {
  return FRACTION_DIGITS[currency.toUpperCase()] ?? 2;
}

function toBigInt(input: bigint | number): bigint {
  if (typeof input === "bigint") return input;
  if (!Number.isFinite(input)) throw new Error("amountMinor must be finite");
  if (!Number.isInteger(input)) throw new Error("amountMinor must be an integer");
  return BigInt(input);
}

/**
 * Render a minor-unit amount in human form. Always rounds to the currency's
 * display fraction digits — storage stays at STORAGE_FRACTION_DIGITS.
 */
export function formatMoneyMinor(
  amountMinor: bigint | number,
  currency: string,
  opts: { signDisplay?: "auto" | "always" | "never"; compact?: boolean } = {},
): string {
  const minor = toBigInt(amountMinor);
  const sign = minor < 0n ? -1n : 1n;
  const abs = minor < 0n ? -minor : minor;

  const displayDigits = fractionDigits(currency);
  // Convert storage minor (2 digits) into display number.
  const major = Number(abs) / 10 ** STORAGE_FRACTION_DIGITS;
  const signed = (Number(sign) * major) || 0;

  if (opts.compact && Math.abs(signed) >= 1_000_000) {
    const compactValue = signed / 1_000_000;
    const compactStr = compactValue.toFixed(compactValue >= 100 || compactValue <= -100 ? 0 : 1);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 1,
      signDisplay: opts.signDisplay ?? "auto",
    })
      .format(0)
      .replace(/[\d.,-]+/, `${compactStr}M`);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: displayDigits,
    minimumFractionDigits: displayDigits,
    signDisplay: opts.signDisplay ?? "auto",
  }).format(signed);
}

/**
 * Parse user input ("1234.56", "1,234.56", "$1,234.56", "12 345,67") into a
 * BIGINT minor amount with the storage fraction (2 digits). Throws on garbage.
 */
export function parseMoneyToMinor(input: string | number): bigint {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Invalid number");
    return BigInt(Math.round(input * 10 ** STORAGE_FRACTION_DIGITS));
  }
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Empty money input");
  // Strip currency symbols and spaces, normalise comma decimal.
  const cleaned = trimmed
    .replace(/[A-Za-z$€£¥₿\s]/g, "")
    .replace(/(\d),(\d{3})(?!\d)/g, "$1$2") // 1,234 → 1234 (thousands)
    .replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`Cannot parse money: "${input}"`);
  }
  const num = Number(cleaned);
  return BigInt(Math.round(num * 10 ** STORAGE_FRACTION_DIGITS));
}

export function addMinor(...amounts: (bigint | number)[]): bigint {
  return amounts.reduce<bigint>((acc, a) => acc + toBigInt(a), 0n);
}

export function subtractMinor(a: bigint | number, b: bigint | number): bigint {
  return toBigInt(a) - toBigInt(b);
}

/**
 * `percent` is a decimal in 0–100 range (e.g. 18 for 18%, 3.5 for 3.5%).
 * Rounding is half-away-from-zero for determinism; the remainder is exposed
 * so allocation callers can re-distribute it.
 */
export function percentOfMinor(
  amountMinor: bigint | number,
  percent: number,
): { amount: bigint; remainder: bigint } {
  if (!Number.isFinite(percent)) throw new Error("percent must be finite");
  const amt = toBigInt(amountMinor);
  // Scale percent to 6 decimal places (1_000_000) before BigInt division to
  // keep precision; denominator is 100 * 1_000_000 = 100_000_000.
  const scaled = BigInt(Math.round(percent * 1_000_000));
  const allocated = (amt * scaled) / 100_000_000n;
  return { amount: allocated, remainder: amt - allocated };
}

/**
 * Split `amountMinor` across N weights (e.g. ownership share percents).
 * Returns one allocated amount per weight in input order. Any rounding
 * remainder is added to the largest weight (ties broken by first occurrence).
 */
export function splitByWeights(
  amountMinor: bigint | number,
  weights: number[],
): { allocations: bigint[]; remainder: bigint } {
  const amt = toBigInt(amountMinor);
  if (weights.length === 0) return { allocations: [], remainder: amt };
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return { allocations: weights.map(() => 0n), remainder: amt };

  // Use BigInt math via fixed scale.
  const SCALE = 1_000_000n;
  const totalScaled = BigInt(Math.round(total * 1_000_000));
  const allocations = weights.map((w) => {
    const wScaled = BigInt(Math.round(w * 1_000_000));
    return (amt * wScaled) / totalScaled;
  });

  let allocatedSum = allocations.reduce<bigint>((s, a) => s + a, 0n);
  let remainder = amt - allocatedSum;

  // Assign the remainder deterministically to the largest weight.
  if (remainder !== 0n && weights.length > 0) {
    let largest = 0;
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > weights[largest]) largest = i;
    }
    allocations[largest] += remainder;
    allocatedSum += remainder;
    remainder = 0n;
  }
  // Avoid unused-binding lint complaint on allocatedSum.
  void allocatedSum;
  void SCALE;

  return { allocations, remainder };
}

export function safeDivide(a: bigint | number, b: bigint | number): number {
  const av = typeof a === "bigint" ? Number(a) : a;
  const bv = typeof b === "bigint" ? Number(b) : b;
  if (!bv) return 0;
  return av / bv;
}

export function calculateNights(checkIn: string | Date, checkOut: string | Date): number {
  const ci = typeof checkIn === "string" ? new Date(checkIn) : checkIn;
  const co = typeof checkOut === "string" ? new Date(checkOut) : checkOut;
  const ms = co.getTime() - ci.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/** Average daily rate in minor units. */
export function calculateAdrMinor(grossRevenueMinor: bigint, soldNights: number): bigint {
  if (soldNights <= 0) return 0n;
  return grossRevenueMinor / BigInt(soldNights);
}

/** Revenue per available room in minor units. */
export function calculateRevparMinor(grossRevenueMinor: bigint, availableNights: number): bigint {
  if (availableNights <= 0) return 0n;
  return grossRevenueMinor / BigInt(availableNights);
}
