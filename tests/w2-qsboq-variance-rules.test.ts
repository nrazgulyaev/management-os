/**
 * W2-QSBOQ — unit coverage for the pure BOQ variance classification
 * rules (src/features/ai-agents/boq/variance-rules.ts).
 *
 * The variance-detector agent + the QS cabinet card both rely on this
 * module, so the flag set + kind classification must be deterministic.
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyVarianceKind,
  evaluateVarianceLine,
  detectVariances,
  VARIANCE_FLAG_PCT,
  type VarianceLineInput,
} from "../src/features/ai-agents/boq/variance-rules";

const base = (over: Partial<VarianceLineInput>): VarianceLineInput => ({
  lineId: "line-1",
  qtyPlanned: 100,
  ratePlanned: 10,
  qtyActual: 100,
  rateActual: 10,
  ...over,
});

test("on-plan line is not flagged (tone ok)", () => {
  const f = evaluateVarianceLine(base({}));
  assert.equal(f.variance.flagged, false);
  assert.equal(f.variance.tone, "ok");
  assert.equal(f.magnitudePct, 0);
});

test("line with no actuals yields neutral, never flagged", () => {
  const f = evaluateVarianceLine(base({ qtyActual: 0, rateActual: 0 }));
  assert.equal(f.variance.tone, "neutral");
  assert.equal(f.variance.flagged, false);
  assert.equal(classifyVarianceKind(base({ qtyActual: 0 })), "other");
});

test("just under threshold (5%) is NOT flagged; just over IS", () => {
  // 5% exactly → ok per WARN_PCT boundary (|Δ| > 5 flags).
  const at5 = evaluateVarianceLine(base({ rateActual: 10.5 })); // +5%
  assert.equal(at5.variance.flagged, false);
  const over5 = evaluateVarianceLine(base({ rateActual: 10.6 })); // +6%
  assert.equal(over5.variance.flagged, true);
  assert.ok(Math.abs(over5.magnitudePct) > VARIANCE_FLAG_PCT);
});

test("rate-driven overrun classifies as rate_change", () => {
  const f = evaluateVarianceLine(base({ rateActual: 13 })); // +30% rate, qty flat
  assert.equal(f.variance.flagged, true);
  assert.equal(f.variance.tone, "danger");
  assert.equal(f.kind, "rate_change");
  assert.ok(f.magnitudeMajor > 0);
});

test("qty-driven overrun classifies as qty_mismatch", () => {
  const f = evaluateVarianceLine(base({ qtyActual: 130 })); // +30% qty, rate flat
  assert.equal(f.variance.flagged, true);
  assert.equal(f.kind, "qty_mismatch");
});

test("under-budget saving is flagged and signed negative", () => {
  const f = evaluateVarianceLine(base({ rateActual: 7 })); // -30%
  assert.equal(f.variance.flagged, true);
  assert.ok(f.magnitudePct < 0);
  assert.ok(f.magnitudeMajor < 0);
  // qty flat, rate-dominant → rate_change (direction is encoded in the sign).
  assert.equal(f.kind, "rate_change");
});

test("balanced small qty+rate drift with material total falls back to budget direction", () => {
  // qty +1% (< QTY_DOMINANT_PCT), rate +1% → neither dominates, but
  // combined total is ~+2% which is under 5% → not flagged.
  const f = evaluateVarianceLine(
    base({ qtyActual: 101, rateActual: 10.1 }),
  );
  assert.equal(f.variance.flagged, false);
  // classification still resolves to a budget direction (over).
  assert.equal(classifyVarianceKind(base({ qtyActual: 101, rateActual: 10.1 })), "over_budget");
});

test("detectVariances returns only flagged lines", () => {
  const lines: VarianceLineInput[] = [
    base({ lineId: "ok", rateActual: 10 }), // on plan
    base({ lineId: "flagged-rate", rateActual: 14 }), // +40%
    base({ lineId: "no-actuals", qtyActual: 0, rateActual: 0 }),
    base({ lineId: "flagged-qty", qtyActual: 140 }), // +40% qty
  ];
  const flags = detectVariances(lines);
  const ids = flags.map((f) => f.lineId).sort();
  assert.deepEqual(ids, ["flagged-qty", "flagged-rate"]);
});

test("zero planned with actuals reports 100% pct without throwing", () => {
  const kind = classifyVarianceKind(
    base({ qtyPlanned: 0, ratePlanned: 0, qtyActual: 5, rateActual: 10 }),
  );
  // qty went 0 → 5 (pctDelta returns 100, dominates) → qty_mismatch.
  assert.equal(kind, "qty_mismatch");
});
