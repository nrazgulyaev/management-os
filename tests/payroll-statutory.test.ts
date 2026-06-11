/**
 * Pure-calc tests for the Indonesian payroll statutory module
 * (src/features/payroll/statutory.ts) + effective-date proration.
 *
 * These exercise the BPJS employer/employee split, the JP & Kesehatan caps,
 * the PPh21 TER monthly method (incl. the K/1→B gotcha + no-NPWP surcharge),
 * and the active-days proration. No DB — the module is intentionally pure.
 *
 * Reference figures are the researched 2026 defaults (DEFAULT_STATUTORY_SETTINGS).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const M = async () => import("../src/features/payroll/statutory");

// Helper: rupiah → minor (sen).
const r = (rupiah: number): bigint => BigInt(rupiah) * 100n;

// Settings with the master switch ON (defaults are off).
async function enabledSettings() {
  const { DEFAULT_STATUTORY_SETTINGS } = await M();
  return { ...DEFAULT_STATUTORY_SETTINGS, statutoryEnabled: true };
}

// ---------------------------------------------------------------------------
// Disabled → pure pass-through (existing behaviour unchanged).
// ---------------------------------------------------------------------------
test("statutory disabled returns a zeroed split (net = total = gross)", async () => {
  const { computeStatutory, DEFAULT_STATUTORY_SETTINGS } = await M();
  const gross = r(10_000_000);
  const res = computeStatutory(gross, "TK/0", DEFAULT_STATUTORY_SETTINGS); // disabled by default
  assert.equal(res.employerContribMinor, 0n);
  assert.equal(res.employeeBpjsMinor, 0n);
  assert.equal(res.pph21Minor, 0n);
  assert.equal(res.netTakeHomeMinor, gross);
  assert.equal(res.totalEmployerCostMinor, gross);
  assert.equal(res.terCategory, null);
});

// ---------------------------------------------------------------------------
// BPJS split below all caps — every component scales with full gross.
// ---------------------------------------------------------------------------
test("BPJS split for a Rp8,000,000 earner (below all caps), no PPh21 (TK/0 0% floor)", async () => {
  const { computeStatutory } = await M();
  const s = await enabledSettings();
  const gross = r(8_000_000); // below JP cap (11,086,300), below Kesehatan cap (12M)
  const res = computeStatutory(gross, "TK/0", s);

  // Employer: JHT 3.7% = 296,000 ; JKK 0.24% = 19,200 ; JKM 0.30% = 24,000 ;
  //           JP 2% = 160,000 ; Kesehatan 4% = 320,000.
  assert.equal(res.employer.jhtMinor, r(296_000));
  assert.equal(res.employer.jkkMinor, r(19_200));
  assert.equal(res.employer.jkmMinor, r(24_000));
  assert.equal(res.employer.jpMinor, r(160_000));
  assert.equal(res.employer.kesehatanMinor, r(320_000));
  assert.equal(res.employerContribMinor, r(296_000 + 19_200 + 24_000 + 160_000 + 320_000));

  // Employee: JHT 2% = 160,000 ; JP 1% = 80,000 ; Kesehatan 1% = 80,000.
  assert.equal(res.employee.jhtMinor, r(160_000));
  assert.equal(res.employee.jpMinor, r(80_000));
  assert.equal(res.employee.kesehatanMinor, r(80_000));
  assert.equal(res.employeeBpjsMinor, r(160_000 + 80_000 + 80_000));

  // PPh21: TK/0 → Category A; Rp8,000,000 is in the 1.5% band (7,500,001–8,550,000).
  assert.equal(res.terCategory, "A");
  assert.equal(res.pph21Minor, r(120_000)); // 8,000,000 × 1.5%

  // Totals.
  assert.equal(res.totalEmployerCostMinor, gross + res.employerContribMinor);
  assert.equal(res.netTakeHomeMinor, gross - res.employeeBpjsMinor - res.pph21Minor);
});

// ---------------------------------------------------------------------------
// JP cap (Rp11,086,300) + Kesehatan cap (Rp12,000,000) bite for a high earner.
// ---------------------------------------------------------------------------
test("JP and Kesehatan caps bite above their ceilings; JHT/JKK/JKM keep scaling", async () => {
  const { computeStatutory } = await M();
  const s = await enabledSettings();
  const gross = r(20_000_000); // above both caps
  const res = computeStatutory(gross, "TK/0", s);

  // JP employer 2% on the cap (11,086,300) = 221,726 ; max per the research.
  assert.equal(res.employer.jpMinor, r(221_726));
  // JP employee 1% on the cap = 110,863.
  assert.equal(res.employee.jpMinor, r(110_863));
  // Kesehatan employer 4% on the 12,000,000 cap = 480,000 ; employee 1% = 120,000.
  assert.equal(res.employer.kesehatanMinor, r(480_000));
  assert.equal(res.employee.kesehatanMinor, r(120_000));
  // JHT employer 3.7% on FULL gross (no cap) = 740,000.
  assert.equal(res.employer.jhtMinor, r(740_000));
  // JKK 0.24% full = 48,000 ; JKM 0.30% full = 60,000.
  assert.equal(res.employer.jkkMinor, r(48_000));
  assert.equal(res.employer.jkmMinor, r(60_000));
});

// ---------------------------------------------------------------------------
// PPh21 0% floor: at/below the category floor, zero is withheld.
// ---------------------------------------------------------------------------
test("PPh21 is zero at/below the Category A floor (Rp5,400,000)", async () => {
  const { computeStatutory } = await M();
  const s = await enabledSettings();
  const res = computeStatutory(r(5_400_000), "TK/0", s);
  assert.equal(res.pph21Minor, 0n);
  assert.equal(res.terCategory, "A");
});

// ---------------------------------------------------------------------------
// TER category mapping — the K/1→B gotcha + K/3→C.
// ---------------------------------------------------------------------------
test("TER category mapping: K/1 is B (not A), K/3 is C, K/0 is A", async () => {
  const { terCategoryFor } = await M();
  assert.equal(terCategoryFor("TK/0"), "A");
  assert.equal(terCategoryFor("K/0"), "A");
  assert.equal(terCategoryFor("TK/1"), "A");
  assert.equal(terCategoryFor("K/1"), "B"); // the gotcha
  assert.equal(terCategoryFor("K/2"), "B");
  assert.equal(terCategoryFor("TK/2"), "B");
  assert.equal(terCategoryFor("K/3"), "C");
});

test("Category B floor is Rp6,200,000 (K/1 at 6,000,000 pays 0 PPh21)", async () => {
  const { computeStatutory } = await M();
  const s = await enabledSettings();
  // 6,000,000 would be taxable in Category A but is below B's 6,200,000 floor.
  const res = computeStatutory(r(6_000_000), "K/1", s);
  assert.equal(res.terCategory, "B");
  assert.equal(res.pph21Minor, 0n);
});

// ---------------------------------------------------------------------------
// no-NPWP surcharge: +20% on top of computed PPh21.
// ---------------------------------------------------------------------------
test("no-NPWP surcharge adds 20% on top of PPh21", async () => {
  const { computeStatutory } = await M();
  const s = await enabledSettings();
  const gross = r(8_000_000); // Category A 1.5% → 120,000
  const base = computeStatutory(gross, "TK/0", s, { noNpwp: false });
  const surcharged = computeStatutory(gross, "TK/0", s, { noNpwp: true });
  assert.equal(base.pph21Minor, r(120_000));
  // 120,000 × 1.2 = 144,000.
  assert.equal(surcharged.pph21Minor, r(144_000));
});

// ---------------------------------------------------------------------------
// PPh21 only when a PTKP status is present.
// ---------------------------------------------------------------------------
test("PPh21 is not withheld without a PTKP status; BPJS still applies", async () => {
  const { computeStatutory } = await M();
  const s = await enabledSettings();
  const res = computeStatutory(r(8_000_000), null, s);
  assert.equal(res.pph21Minor, 0n);
  assert.equal(res.terCategory, null);
  assert.ok(res.employerContribMinor > 0n);
  assert.ok(res.employeeBpjsMinor > 0n);
});

// ---------------------------------------------------------------------------
// PPh21 toggle off → no income tax even with a PTKP status.
// ---------------------------------------------------------------------------
test("org pph21Enabled=false disables PPh21 but keeps BPJS", async () => {
  const { computeStatutory } = await M();
  const s = { ...(await enabledSettings()), pph21Enabled: false };
  const res = computeStatutory(r(8_000_000), "TK/0", s);
  assert.equal(res.pph21Minor, 0n);
  assert.ok(res.employerContribMinor > 0n);
});

// ---------------------------------------------------------------------------
// Total employer cost = gross + employer BPJS (the binding posting amount).
// ---------------------------------------------------------------------------
test("totalEmployerCost = gross + employer contributions", async () => {
  const { computeStatutory } = await M();
  const s = await enabledSettings();
  const gross = r(8_000_000);
  const res = computeStatutory(gross, "TK/0", s);
  assert.equal(res.totalEmployerCostMinor, gross + res.employerContribMinor);
  // For a low earner (below caps) employer on-cost ≈ 10.24%.
  // 296,000+19,200+24,000+160,000+320,000 = 819,200 = 10.24% of 8,000,000.
  assert.equal(res.employerContribMinor, r(819_200));
});

// ---------------------------------------------------------------------------
// Proration — effective dating.
// ---------------------------------------------------------------------------
test("daysInMonth handles 28/30/31-day months", async () => {
  const { daysInMonth } = await M();
  assert.equal(daysInMonth("2026-02-01"), 28);
  assert.equal(daysInMonth("2024-02-01"), 29); // leap
  assert.equal(daysInMonth("2026-04-01"), 30);
  assert.equal(daysInMonth("2026-03-01"), 31);
});

test("full-month proration when hired/ended are null", async () => {
  const { computeProration, prorateMinor } = await M();
  const p = computeProration("2026-06-01", null, null);
  assert.equal(p.active, true);
  assert.equal(p.numerator, 30);
  assert.equal(p.denominator, 30);
  assert.equal(prorateMinor(r(9_000_000), p), r(9_000_000));
});

test("hired mid-month prorates by active days inclusive", async () => {
  const { computeProration, prorateMinor } = await M();
  // Hired June 16 → active June 16..30 = 15 days of 30.
  const p = computeProration("2026-06-01", "2026-06-16", null);
  assert.equal(p.numerator, 15);
  assert.equal(p.denominator, 30);
  assert.equal(prorateMinor(r(9_000_000), p), r(4_500_000));
});

test("ended mid-month prorates by active days inclusive", async () => {
  const { computeProration, prorateMinor } = await M();
  // Ended June 10 → active June 1..10 = 10 days of 30.
  const p = computeProration("2026-06-01", null, "2026-06-10");
  assert.equal(p.numerator, 10);
  assert.equal(prorateMinor(r(9_000_000), p), r(3_000_000));
});

test("hired AND ended in the same month → only the overlap days", async () => {
  const { computeProration } = await M();
  const p = computeProration("2026-06-01", "2026-06-10", "2026-06-20");
  // June 10..20 inclusive = 11 days.
  assert.equal(p.numerator, 11);
  assert.equal(p.denominator, 30);
});

test("not active at all in the month → posts nothing", async () => {
  const { computeProration, prorateMinor } = await M();
  const before = computeProration("2026-06-01", null, "2026-05-31"); // ended last month
  assert.equal(before.active, false);
  assert.equal(before.numerator, 0);
  assert.equal(prorateMinor(r(9_000_000), before), 0n);

  const after = computeProration("2026-06-01", "2026-07-01", null); // hired next month
  assert.equal(after.active, false);
  assert.equal(after.numerator, 0);
});

test("hired before + ended after the month → full month", async () => {
  const { computeProration } = await M();
  const p = computeProration("2026-06-01", "2026-01-01", "2026-12-31");
  assert.equal(p.numerator, 30);
  assert.equal(p.denominator, 30);
  assert.equal(p.active, true);
});

// ---------------------------------------------------------------------------
// Integration: prorate the gross THEN compute statutory on the prorated gross.
// ---------------------------------------------------------------------------
test("statutory computed on the PRORATED gross (half-month hire)", async () => {
  const { computeProration, prorateMinor, computeStatutory } = await M();
  const s = await enabledSettings();
  const full = r(16_000_000);
  const p = computeProration("2026-06-01", "2026-06-16", null); // 15/30
  const gross = prorateMinor(full, p);
  assert.equal(gross, r(8_000_000));
  const res = computeStatutory(gross, "TK/0", s);
  // Same as the standalone Rp8,000,000 case.
  assert.equal(res.employerContribMinor, r(819_200));
  assert.equal(res.pph21Minor, r(120_000));
});
