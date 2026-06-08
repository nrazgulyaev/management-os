import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveOnTimeScore,
  deriveQualityScore,
  derivePriceScore,
  deriveResponsivenessScore,
  cohortMedianUnitPrice,
  scoreVendorFromHistory,
  scoreCohort,
  NEUTRAL_SUBSCORE,
  type VendorHistoryAggregate,
} from "../src/features/ai-agents/vendors/vendor-score-from-history";

function emptyAgg(
  overrides: Partial<VendorHistoryAggregate> = {},
): VendorHistoryAggregate {
  return {
    vendorId: "v1",
    deliveredLines: 0,
    onTimeLines: 0,
    qaPassedLines: 0,
    qaCheckedLines: 0,
    acceptedDeliveries: 0,
    totalDeliveries: 0,
    avgUnitPriceUsdMinor: null,
    quotationsReturned: 0,
    avgQuoteTurnaroundDays: null,
    ...overrides,
  };
}

test("on-time score: perfect, partial, and no-signal cases", () => {
  assert.equal(
    deriveOnTimeScore(emptyAgg({ deliveredLines: 10, onTimeLines: 10 })),
    100,
  );
  assert.equal(
    deriveOnTimeScore(emptyAgg({ deliveredLines: 10, onTimeLines: 8 })),
    80,
  );
  assert.equal(
    deriveOnTimeScore(emptyAgg({ deliveredLines: 10, onTimeLines: 0 })),
    0,
  );
  // No deliveries → neutral baseline (don't punish a new vendor to zero).
  assert.equal(deriveOnTimeScore(emptyAgg()), NEUTRAL_SUBSCORE);
});

test("quality score: blends line pass-rate (0.7) + header acceptance (0.3)", () => {
  // 100% line pass + 100% accepted → 100.
  assert.equal(
    deriveQualityScore(
      emptyAgg({
        qaPassedLines: 5,
        qaCheckedLines: 5,
        acceptedDeliveries: 3,
        totalDeliveries: 3,
      }),
    ),
    100,
  );
  // 50% line pass + 0% accepted → 0.5*0.7 = 0.35 → 35.
  assert.equal(
    deriveQualityScore(
      emptyAgg({
        qaPassedLines: 5,
        qaCheckedLines: 10,
        acceptedDeliveries: 0,
        totalDeliveries: 4,
      }),
    ),
    35,
  );
  // Header-only signal falls back to header rate.
  assert.equal(
    deriveQualityScore(emptyAgg({ acceptedDeliveries: 2, totalDeliveries: 4 })),
    50,
  );
  assert.equal(deriveQualityScore(emptyAgg()), NEUTRAL_SUBSCORE);
});

test("price score: relative to cohort median (cheaper wins)", () => {
  const median = 1000;
  // Exactly at median → 70 (neutral anchor).
  assert.equal(
    derivePriceScore(emptyAgg({ avgUnitPriceUsdMinor: 1000 }), median),
    70,
  );
  // 20% cheaper → 70 - (-0.2)*100 = 90.
  assert.equal(
    derivePriceScore(emptyAgg({ avgUnitPriceUsdMinor: 800 }), median),
    90,
  );
  // 20% pricier → 70 - 0.2*100 = 50.
  assert.equal(
    derivePriceScore(emptyAgg({ avgUnitPriceUsdMinor: 1200 }), median),
    50,
  );
  // No price or no cohort → neutral.
  assert.equal(derivePriceScore(emptyAgg(), median), NEUTRAL_SUBSCORE);
  assert.equal(
    derivePriceScore(emptyAgg({ avgUnitPriceUsdMinor: 1000 }), null),
    NEUTRAL_SUBSCORE,
  );
});

test("responsiveness score: faster RFQ turnaround wins", () => {
  assert.equal(
    deriveResponsivenessScore(
      emptyAgg({ quotationsReturned: 3, avgQuoteTurnaroundDays: 0 }),
    ),
    100,
  );
  assert.equal(
    deriveResponsivenessScore(
      emptyAgg({ quotationsReturned: 3, avgQuoteTurnaroundDays: 4 }),
    ),
    80,
  );
  assert.equal(
    deriveResponsivenessScore(
      emptyAgg({ quotationsReturned: 3, avgQuoteTurnaroundDays: 30 }),
    ),
    0,
  );
  assert.equal(deriveResponsivenessScore(emptyAgg()), NEUTRAL_SUBSCORE);
});

test("cohort median: odd/even/empty", () => {
  assert.equal(
    cohortMedianUnitPrice([
      emptyAgg({ avgUnitPriceUsdMinor: 100 }),
      emptyAgg({ avgUnitPriceUsdMinor: 300 }),
      emptyAgg({ avgUnitPriceUsdMinor: 200 }),
    ]),
    200,
  );
  assert.equal(
    cohortMedianUnitPrice([
      emptyAgg({ avgUnitPriceUsdMinor: 100 }),
      emptyAgg({ avgUnitPriceUsdMinor: 300 }),
    ]),
    200,
  );
  assert.equal(cohortMedianUnitPrice([emptyAgg()]), null);
});

test("composite: a strong vendor lands in the high band, a weak one in low", () => {
  const strong = scoreVendorFromHistory(
    emptyAgg({
      deliveredLines: 10,
      onTimeLines: 10,
      qaPassedLines: 10,
      qaCheckedLines: 10,
      acceptedDeliveries: 5,
      totalDeliveries: 5,
      avgUnitPriceUsdMinor: 700,
      quotationsReturned: 4,
      avgQuoteTurnaroundDays: 1,
    }),
    1000,
  );
  assert.equal(strong.band, "high");
  assert.ok(strong.composite >= 85, `expected high composite, got ${strong.composite}`);

  const weak = scoreVendorFromHistory(
    emptyAgg({
      deliveredLines: 10,
      onTimeLines: 2,
      qaPassedLines: 3,
      qaCheckedLines: 10,
      acceptedDeliveries: 1,
      totalDeliveries: 5,
      avgUnitPriceUsdMinor: 1500,
      quotationsReturned: 4,
      avgQuoteTurnaroundDays: 20,
    }),
    1000,
  );
  assert.equal(weak.band, "low");
  assert.ok(weak.composite < 65, `expected low composite, got ${weak.composite}`);
});

test("determinism: same input → same output; cohort scoring is self-consistent", () => {
  const aggs = [
    emptyAgg({ vendorId: "a", avgUnitPriceUsdMinor: 800, deliveredLines: 4, onTimeLines: 4 }),
    emptyAgg({ vendorId: "b", avgUnitPriceUsdMinor: 1200, deliveredLines: 4, onTimeLines: 2 }),
  ];
  const first = scoreCohort(aggs);
  const second = scoreCohort(aggs);
  assert.deepEqual(first, second);
  // Cheaper + more on-time vendor "a" must outscore "b".
  const aScore = first.find((r) => r.vendorId === "a")!.result.composite;
  const bScore = first.find((r) => r.vendorId === "b")!.result.composite;
  assert.ok(aScore > bScore, `expected a (${aScore}) > b (${bScore})`);
});
