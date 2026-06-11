/**
 * Indonesian payroll statutory — PURE calculation module (no DB, no I/O).
 *
 * Implements the employer/employee split for:
 *   - BPJS Ketenagakerjaan: JHT, JKK, JKM, JP (capped)
 *   - BPJS Kesehatan (capped)
 *   - PPh21 income tax via the post-2024 TER Bulanan (monthly average effective
 *     rate) method, per PMK 168/2023 + PP 58/2023.
 *
 * All money is BIGINT minor units (IDR sen). Rates are passed in as plain
 * numbers expressing PERCENT (3.7 = 3.7%). Caps are minor units. Everything is
 * org-overridable via StatutorySettings — this module hardcodes nothing about a
 * specific org; the DEFAULT_STATUTORY_SETTINGS below are the researched 2026
 * figures the caller seeds and may override.
 *
 * SCOPE: monthly withholding only. The December Article-17 annual reconciliation
 * is OUT OF SCOPE — for Jan–Nov (and as a simple monthly default for Dec too)
 * monthly PPh21 = TER_rate(category, gross) × gross. PTKP is NOT subtracted
 * separately in the TER method — it is baked into the category + bracket.
 *
 * Sources: BPJS letter B/1226/022026 (JP cap Rp11,086,300 eff. Mar 2026);
 * PMK 168/2023 (TER A/B/C tables); PMK 101/2016 (PTKP, unchanged 2025–2026).
 */

import type { PtkpStatus } from "@/lib/db/schema/payroll";

// -----------------------------------------------------------------------------
// Settings shape (mirrors org_payroll_settings; all org-overridable).
// -----------------------------------------------------------------------------
export interface StatutorySettings {
  /** Master switch — when false, computeStatutory returns a zeroed result. */
  statutoryEnabled: boolean;

  // BPJS Ketenagakerjaan — JHT (no cap).
  jhtEmployerPct: number;
  jhtEmployeePct: number;
  // JKK (employer-only, risk-tier).
  jkkEmployerPct: number;
  // JKM (employer-only).
  jkmEmployerPct: number;
  // JP (capped wage base).
  jpEmployerPct: number;
  jpEmployeePct: number;
  jpCapMinor: bigint;
  // BPJS Kesehatan (capped wage base).
  kesehatanEmployerPct: number;
  kesehatanEmployeePct: number;
  kesehatanCapMinor: bigint;

  // PPh21 (TER monthly method).
  pph21Enabled: boolean;
  noNpwpSurchargePct: number;
}

/**
 * Researched 2026 DEFAULTS (editable per org). JKK defaults to the very-low
 * hospitality tier (0.24%). Caps in minor units: JP Rp11,086,300, Kesehatan
 * Rp12,000,000.
 */
export const DEFAULT_STATUTORY_SETTINGS: StatutorySettings = {
  statutoryEnabled: false,
  jhtEmployerPct: 3.7,
  jhtEmployeePct: 2,
  jkkEmployerPct: 0.24,
  jkmEmployerPct: 0.3,
  jpEmployerPct: 2,
  jpEmployeePct: 1,
  jpCapMinor: 1_108_630_000n, // Rp11,086,300 * 100
  kesehatanEmployerPct: 4,
  kesehatanEmployeePct: 1,
  kesehatanCapMinor: 1_200_000_000n, // Rp12,000,000 * 100
  pph21Enabled: true,
  noNpwpSurchargePct: 20,
};

/** JKK risk tiers (employer-only %), selectable per org. */
export const JKK_RISK_TIERS = [
  { key: "very_low", label: "Very low (0.24%)", pct: 0.24 },
  { key: "low", label: "Low (0.54%)", pct: 0.54 },
  { key: "medium", label: "Medium (0.89%)", pct: 0.89 },
  { key: "high", label: "High (1.27%)", pct: 1.27 },
  { key: "very_high", label: "Very high (1.74%)", pct: 1.74 },
] as const;

// -----------------------------------------------------------------------------
// PTKP → TER category mapping (PMK 168/2023). GOTCHA: K/1 is B, not A.
// -----------------------------------------------------------------------------
export type TerCategory = "A" | "B" | "C";

const PTKP_TO_TER: Record<PtkpStatus, TerCategory> = {
  "TK/0": "A",
  "TK/1": "A",
  "K/0": "A",
  "TK/2": "B",
  "TK/3": "B",
  "K/1": "B", // <-- common implementer error: K/1 is B
  "K/2": "B",
  "K/3": "C",
};

export function terCategoryFor(ptkp: PtkpStatus): TerCategory {
  return PTKP_TO_TER[ptkp];
}

// -----------------------------------------------------------------------------
// TER tables (PMK 168/2023 attachment). Each entry = { uptoMinor, pct }, sorted
// ascending; the rate applies to monthly gross AT OR BELOW uptoMinor (and above
// the previous band). The last band has uptoMinor = Infinity-ish (we use a huge
// sentinel) at 34%. Amounts here are MINOR units (rupiah * 100); the published
// tables are in rupiah, so each rupiah threshold is * 100.
//
// Encoding note: published tables give the UPPER bound of each band inclusive.
// We store uptoMinor as that inclusive upper bound; lookup returns the first
// band whose uptoMinor >= gross. The 0% floor is the first band.
// -----------------------------------------------------------------------------
interface TerBand {
  uptoMinor: bigint;
  pct: number;
}

const SENTINEL = 9_999_999_999_999n; // > Rp1.4B cap, the open-ended top band

// Helper: rupiah threshold → minor units.
const r = (rupiah: number): bigint => BigInt(rupiah) * 100n;

/**
 * Category A (PTKP TK/0, TK/1, K/0). 44 bands. 0% up to Rp5,400,000.
 * Source: PMK 168/2023 Lampiran, TER Bulanan Kategori A.
 */
const TER_A: TerBand[] = [
  { uptoMinor: r(5_400_000), pct: 0 },
  { uptoMinor: r(5_650_000), pct: 0.25 },
  { uptoMinor: r(5_950_000), pct: 0.5 },
  { uptoMinor: r(6_300_000), pct: 0.75 },
  { uptoMinor: r(6_750_000), pct: 1 },
  { uptoMinor: r(7_500_000), pct: 1.25 },
  { uptoMinor: r(8_550_000), pct: 1.5 },
  { uptoMinor: r(9_650_000), pct: 1.75 },
  { uptoMinor: r(10_050_000), pct: 2 },
  { uptoMinor: r(10_350_000), pct: 2.25 },
  { uptoMinor: r(10_700_000), pct: 2.5 },
  { uptoMinor: r(11_050_000), pct: 3 },
  { uptoMinor: r(11_600_000), pct: 3.5 },
  { uptoMinor: r(12_500_000), pct: 4 },
  { uptoMinor: r(13_750_000), pct: 5 },
  { uptoMinor: r(15_100_000), pct: 6 },
  { uptoMinor: r(16_950_000), pct: 7 },
  { uptoMinor: r(19_750_000), pct: 8 },
  { uptoMinor: r(24_150_000), pct: 9 },
  { uptoMinor: r(26_450_000), pct: 10 },
  { uptoMinor: r(28_000_000), pct: 11 },
  { uptoMinor: r(30_050_000), pct: 12 },
  { uptoMinor: r(32_400_000), pct: 13 },
  { uptoMinor: r(35_400_000), pct: 14 },
  { uptoMinor: r(39_100_000), pct: 15 },
  { uptoMinor: r(43_850_000), pct: 16 },
  { uptoMinor: r(47_800_000), pct: 17 },
  { uptoMinor: r(51_400_000), pct: 18 },
  { uptoMinor: r(56_300_000), pct: 19 },
  { uptoMinor: r(62_200_000), pct: 20 },
  { uptoMinor: r(68_600_000), pct: 21 },
  { uptoMinor: r(77_500_000), pct: 22 },
  { uptoMinor: r(89_000_000), pct: 23 },
  { uptoMinor: r(103_000_000), pct: 24 },
  { uptoMinor: r(125_000_000), pct: 25 },
  { uptoMinor: r(157_000_000), pct: 26 },
  { uptoMinor: r(206_000_000), pct: 27 },
  { uptoMinor: r(337_000_000), pct: 28 },
  { uptoMinor: r(454_000_000), pct: 29 },
  { uptoMinor: r(550_000_000), pct: 30 },
  { uptoMinor: r(695_000_000), pct: 31 },
  { uptoMinor: r(910_000_000), pct: 32 },
  { uptoMinor: r(1_400_000_000), pct: 33 },
  { uptoMinor: SENTINEL, pct: 34 },
];

/**
 * Category B (PTKP TK/2, TK/3, K/1, K/2). 40 bands. 0% up to Rp6,200,000.
 */
const TER_B: TerBand[] = [
  { uptoMinor: r(6_200_000), pct: 0 },
  { uptoMinor: r(6_500_000), pct: 0.25 },
  { uptoMinor: r(6_850_000), pct: 0.5 },
  { uptoMinor: r(7_300_000), pct: 0.75 },
  { uptoMinor: r(9_200_000), pct: 1 },
  { uptoMinor: r(10_750_000), pct: 1.5 },
  { uptoMinor: r(11_250_000), pct: 2 },
  { uptoMinor: r(11_600_000), pct: 2.5 },
  { uptoMinor: r(12_600_000), pct: 3 },
  { uptoMinor: r(13_600_000), pct: 4 },
  { uptoMinor: r(14_950_000), pct: 5 },
  { uptoMinor: r(16_400_000), pct: 6 },
  { uptoMinor: r(18_450_000), pct: 7 },
  { uptoMinor: r(21_850_000), pct: 8 },
  { uptoMinor: r(26_000_000), pct: 9 },
  { uptoMinor: r(27_700_000), pct: 10 },
  { uptoMinor: r(29_350_000), pct: 11 },
  { uptoMinor: r(31_450_000), pct: 12 },
  { uptoMinor: r(33_950_000), pct: 13 },
  { uptoMinor: r(37_100_000), pct: 14 },
  { uptoMinor: r(41_100_000), pct: 15 },
  { uptoMinor: r(45_800_000), pct: 16 },
  { uptoMinor: r(49_500_000), pct: 17 },
  { uptoMinor: r(53_800_000), pct: 18 },
  { uptoMinor: r(58_500_000), pct: 19 },
  { uptoMinor: r(64_000_000), pct: 20 },
  { uptoMinor: r(71_000_000), pct: 21 },
  { uptoMinor: r(80_000_000), pct: 22 },
  { uptoMinor: r(93_000_000), pct: 23 },
  { uptoMinor: r(109_000_000), pct: 24 },
  { uptoMinor: r(129_000_000), pct: 25 },
  { uptoMinor: r(163_000_000), pct: 26 },
  { uptoMinor: r(211_000_000), pct: 27 },
  { uptoMinor: r(374_000_000), pct: 28 },
  { uptoMinor: r(459_000_000), pct: 29 },
  { uptoMinor: r(555_000_000), pct: 30 },
  { uptoMinor: r(704_000_000), pct: 31 },
  { uptoMinor: r(957_000_000), pct: 32 },
  { uptoMinor: r(1_405_000_000), pct: 33 },
  { uptoMinor: SENTINEL, pct: 34 },
];

/**
 * Category C (PTKP K/3). 41 bands. 0% up to Rp6,600,000.
 */
const TER_C: TerBand[] = [
  { uptoMinor: r(6_600_000), pct: 0 },
  { uptoMinor: r(6_950_000), pct: 0.25 },
  { uptoMinor: r(7_350_000), pct: 0.5 },
  { uptoMinor: r(7_800_000), pct: 0.75 },
  { uptoMinor: r(8_850_000), pct: 1 },
  { uptoMinor: r(9_800_000), pct: 1.25 },
  { uptoMinor: r(10_950_000), pct: 1.5 },
  { uptoMinor: r(11_200_000), pct: 1.75 },
  { uptoMinor: r(12_050_000), pct: 2 },
  { uptoMinor: r(12_950_000), pct: 3 },
  { uptoMinor: r(14_150_000), pct: 4 },
  { uptoMinor: r(15_550_000), pct: 5 },
  { uptoMinor: r(17_050_000), pct: 6 },
  { uptoMinor: r(19_500_000), pct: 7 },
  { uptoMinor: r(22_700_000), pct: 8 },
  { uptoMinor: r(26_600_000), pct: 9 },
  { uptoMinor: r(28_100_000), pct: 10 },
  { uptoMinor: r(30_100_000), pct: 11 },
  { uptoMinor: r(32_600_000), pct: 12 },
  { uptoMinor: r(35_400_000), pct: 13 },
  { uptoMinor: r(38_900_000), pct: 14 },
  { uptoMinor: r(43_000_000), pct: 15 },
  { uptoMinor: r(47_400_000), pct: 16 },
  { uptoMinor: r(51_200_000), pct: 17 },
  { uptoMinor: r(55_800_000), pct: 18 },
  { uptoMinor: r(60_400_000), pct: 19 },
  { uptoMinor: r(66_700_000), pct: 20 },
  { uptoMinor: r(74_500_000), pct: 21 },
  { uptoMinor: r(83_200_000), pct: 22 },
  { uptoMinor: r(95_000_000), pct: 23 },
  { uptoMinor: r(110_000_000), pct: 24 },
  { uptoMinor: r(134_000_000), pct: 25 },
  { uptoMinor: r(169_000_000), pct: 26 },
  { uptoMinor: r(221_000_000), pct: 27 },
  { uptoMinor: r(390_000_000), pct: 28 },
  { uptoMinor: r(463_000_000), pct: 29 },
  { uptoMinor: r(561_000_000), pct: 30 },
  { uptoMinor: r(709_000_000), pct: 31 },
  { uptoMinor: r(965_000_000), pct: 32 },
  { uptoMinor: r(1_419_000_000), pct: 33 },
  { uptoMinor: SENTINEL, pct: 34 },
];

const TER_TABLES: Record<TerCategory, TerBand[]> = { A: TER_A, B: TER_B, C: TER_C };

/** TER rate (percent) for a monthly gross under a category. */
export function terRate(category: TerCategory, grossMinor: bigint): number {
  const table = TER_TABLES[category];
  for (const band of table) {
    if (grossMinor <= band.uptoMinor) return band.pct;
  }
  return table[table.length - 1].pct;
}

// -----------------------------------------------------------------------------
// Money helpers — round-half-up on percent-of-minor; never use floats at rest.
// -----------------------------------------------------------------------------
/** floor/round (gross × pct%) in minor units, capping the base at capMinor. */
function pctOf(baseMinor: bigint, pct: number, capMinor?: bigint): bigint {
  const base = capMinor !== undefined && baseMinor > capMinor ? capMinor : baseMinor;
  if (base <= 0n || pct <= 0) return 0n;
  // base × pct / 100, rounded half-up. Work in scaled integer math: pct has up
  // to 4 decimals (per numeric(6,4)), so scale by 10_000.
  const scaledPct = BigInt(Math.round(pct * 10_000)); // pct% → pct*10^4
  const numerator = base * scaledPct; // = base × pct × 10^4
  const denominator = 1_000_000n; // 100 × 10^4
  // round half up
  return (numerator + denominator / 2n) / denominator;
}

// -----------------------------------------------------------------------------
// Result shape.
// -----------------------------------------------------------------------------
export interface StatutoryResult {
  /** Employer BPJS by component (adds to true employment cost). */
  employer: {
    jhtMinor: bigint;
    jkkMinor: bigint;
    jkmMinor: bigint;
    jpMinor: bigint;
    kesehatanMinor: bigint;
  };
  /** Sum of employer BPJS portions. */
  employerContribMinor: bigint;
  /** Employee BPJS by component (withheld from gross — not employer cost). */
  employee: {
    jhtMinor: bigint;
    jpMinor: bigint;
    kesehatanMinor: bigint;
  };
  /** Sum of employee BPJS portions. */
  employeeBpjsMinor: bigint;
  /** PPh21 income tax (TER monthly method). */
  pph21Minor: bigint;
  /** TER category used (null when PPh21 not computed). */
  terCategory: TerCategory | null;
  /** gross − employee BPJS − PPh21. */
  netTakeHomeMinor: bigint;
  /** gross + employerContrib — what the owner/management actually bears. */
  totalEmployerCostMinor: bigint;
}

/** A fully-zeroed result (statutory disabled / nothing to compute). */
export function zeroStatutory(grossMinor: bigint): StatutoryResult {
  return {
    employer: { jhtMinor: 0n, jkkMinor: 0n, jkmMinor: 0n, jpMinor: 0n, kesehatanMinor: 0n },
    employerContribMinor: 0n,
    employee: { jhtMinor: 0n, jpMinor: 0n, kesehatanMinor: 0n },
    employeeBpjsMinor: 0n,
    pph21Minor: 0n,
    terCategory: null,
    netTakeHomeMinor: grossMinor,
    totalEmployerCostMinor: grossMinor,
  };
}

/**
 * Compute the BPJS + PPh21 split for one staff member's monthly gross.
 *
 * @param grossMinor    monthly gross in minor units (already prorated by caller).
 * @param ptkpStatus    PTKP status; null/undefined → PPh21 is NOT withheld.
 * @param settings      org statutory settings (rates/caps/toggles).
 * @param opts.noNpwp   apply the +20% PPh21 no-NPWP surcharge.
 *
 * Returns a zeroed result (net = total = gross) when statutory is disabled.
 */
export function computeStatutory(
  grossMinor: bigint,
  ptkpStatus: PtkpStatus | null | undefined,
  settings: StatutorySettings,
  opts: { noNpwp?: boolean } = {},
): StatutoryResult {
  if (!settings.statutoryEnabled || grossMinor <= 0n) {
    return zeroStatutory(grossMinor);
  }

  // --- Employer BPJS ---------------------------------------------------------
  const employerJht = pctOf(grossMinor, settings.jhtEmployerPct);
  const employerJkk = pctOf(grossMinor, settings.jkkEmployerPct);
  const employerJkm = pctOf(grossMinor, settings.jkmEmployerPct);
  const employerJp = pctOf(grossMinor, settings.jpEmployerPct, settings.jpCapMinor);
  const employerKesehatan = pctOf(grossMinor, settings.kesehatanEmployerPct, settings.kesehatanCapMinor);
  const employerContribMinor =
    employerJht + employerJkk + employerJkm + employerJp + employerKesehatan;

  // --- Employee BPJS ---------------------------------------------------------
  const employeeJht = pctOf(grossMinor, settings.jhtEmployeePct);
  const employeeJp = pctOf(grossMinor, settings.jpEmployeePct, settings.jpCapMinor);
  const employeeKesehatan = pctOf(grossMinor, settings.kesehatanEmployeePct, settings.kesehatanCapMinor);
  const employeeBpjsMinor = employeeJht + employeeJp + employeeKesehatan;

  // --- PPh21 (TER monthly) ---------------------------------------------------
  // Only when org PPh21 is on AND the staff member has a PTKP status. PTKP is
  // baked into the TER category — we do NOT subtract it separately.
  let pph21Minor = 0n;
  let terCategory: TerCategory | null = null;
  if (settings.pph21Enabled && ptkpStatus) {
    terCategory = terCategoryFor(ptkpStatus);
    const rate = terRate(terCategory, grossMinor);
    pph21Minor = pctOf(grossMinor, rate);
    if (opts.noNpwp && pph21Minor > 0n) {
      // No-NPWP surcharge: +20% ON TOP of the computed PPh21 (i.e. ×1.2).
      const surcharge = pctOf(pph21Minor, settings.noNpwpSurchargePct);
      pph21Minor += surcharge;
    }
  }

  const netTakeHomeMinor = grossMinor - employeeBpjsMinor - pph21Minor;
  const totalEmployerCostMinor = grossMinor + employerContribMinor;

  return {
    employer: {
      jhtMinor: employerJht,
      jkkMinor: employerJkk,
      jkmMinor: employerJkm,
      jpMinor: employerJp,
      kesehatanMinor: employerKesehatan,
    },
    employerContribMinor,
    employee: {
      jhtMinor: employeeJht,
      jpMinor: employeeJp,
      kesehatanMinor: employeeKesehatan,
    },
    employeeBpjsMinor,
    pph21Minor,
    terCategory,
    netTakeHomeMinor,
    totalEmployerCostMinor,
  };
}

// -----------------------------------------------------------------------------
// Proration — active-days / days-in-month for the employment window.
// -----------------------------------------------------------------------------
/** Days in the given YYYY-MM-01 month (UTC). */
export function daysInMonth(periodMonthIso: string): number {
  const d = new Date(periodMonthIso + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export interface ProrationResult {
  /** Active days in the period (numerator). 0 → posts nothing. */
  numerator: number;
  /** Days in the month (denominator). */
  denominator: number;
  /** Whether the staff member is active at all in the month. */
  active: boolean;
}

/**
 * Compute proration for a staff member over a payroll month given hired_on /
 * ended_on. The active window inside the month is:
 *   [max(hired_on, monthStart) .. min(ended_on ?? monthEnd, monthEnd)]
 * inclusive. Days both NULL → full month. A member who left before the month or
 * starts after it → 0 active days (posts nothing).
 *
 * Dates are ISO YYYY-MM-DD strings, compared lexicographically (safe for ISO).
 */
export function computeProration(
  periodMonthIso: string,
  hiredOn: string | null | undefined,
  endedOn: string | null | undefined,
): ProrationResult {
  const denominator = daysInMonth(periodMonthIso);
  const monthStartDay = 1;
  const monthEndDay = denominator;
  const ym = periodMonthIso.slice(0, 7); // YYYY-MM

  // Resolve the effective start/end DAY-of-month within this month.
  let startDay = monthStartDay;
  let endDay = monthEndDay;

  if (hiredOn) {
    if (hiredOn.slice(0, 7) > ym) {
      // Hired after this month entirely.
      return { numerator: 0, denominator, active: false };
    }
    if (hiredOn.slice(0, 7) === ym) {
      startDay = Number(hiredOn.slice(8, 10));
    }
    // hired before this month → startDay stays at 1.
  }

  if (endedOn) {
    if (endedOn.slice(0, 7) < ym) {
      // Ended before this month entirely.
      return { numerator: 0, denominator, active: false };
    }
    if (endedOn.slice(0, 7) === ym) {
      endDay = Number(endedOn.slice(8, 10));
    }
    // ended after this month → endDay stays at month end.
  }

  const numerator = Math.max(0, endDay - startDay + 1);
  return { numerator, denominator, active: numerator > 0 };
}

/**
 * Apply proration to a full-month minor amount: round(amount × num / denom).
 * num >= denom (e.g. full month) returns the amount unchanged.
 */
export function prorateMinor(fullMonthMinor: bigint, p: ProrationResult): bigint {
  if (p.denominator <= 0 || p.numerator <= 0) return 0n;
  if (p.numerator >= p.denominator) return fullMonthMinor;
  const num = fullMonthMinor * BigInt(p.numerator);
  const den = BigInt(p.denominator);
  return (num + den / 2n) / den; // round half up
}
