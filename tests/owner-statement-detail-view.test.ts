import { test } from "node:test";
import assert from "node:assert/strict";

test("compactMoney: minor units → compact major (B/M/K)", async () => {
  const { compactMoney } = await import("../src/features/owner-statements/detail-view");
  // 14,250,000,000 minor = 142,500,000 IDR major → 142.5M
  assert.equal(compactMoney(14_250_000_000n, "IDR"), "IDR 142.5M");
  assert.equal(compactMoney(680_000_000n, "IDR"), "IDR 6.8M");
  // magnitude is taken (sign handled by the caller)
  assert.equal(compactMoney(-680_000_000n, "IDR"), "IDR 6.8M");
});

test("explainerKeyForLine: bucket + PHR/shared refinements", async () => {
  const { explainerKeyForLine } = await import("../src/features/owner-statements/explainers");
  assert.equal(explainerKeyForLine({ lineType: "revenue" }), "revenue");
  assert.equal(explainerKeyForLine({ lineType: "fee" }), "fees");
  assert.equal(explainerKeyForLine({ lineType: "tax", category: "phr" }), "phr");
  assert.equal(explainerKeyForLine({ lineType: "tax", category: "vat" }), "taxes");
  assert.equal(explainerKeyForLine({ lineType: "expense", category: "cleaning (shared)" }), "shared");
  assert.equal(explainerKeyForLine({ lineType: "expense", category: "cleaning" }), "expenses");
  assert.equal(explainerKeyForLine({ lineType: "management_fee" }), "mgmt");
  assert.equal(explainerKeyForLine({ lineType: "reserve" }), "reserves");
});

test("buildStatementView: grouped, signed, ordered, with explainer keys + bold lead", async () => {
  const { buildStatementView } = await import("../src/features/owner-statements/detail-view");
  const view = buildStatementView(
    [
      { lineType: "fee", category: "airbnb", description: "Airbnb 3%", amountMinor: 680_000_000n },
      { lineType: "revenue", category: "nightly", description: "Bookings · 19 nights", amountMinor: 28_460_000_000n },
      { lineType: "revenue", category: "cleaning", description: "Cleaning fees", amountMinor: 1_820_000_000n },
      { lineType: "tax", category: "phr", description: "Bali hospitality tax", amountMinor: 2_850_000_000n },
    ],
    "IDR",
  );

  // Canonical order: revenue, fees, taxes.
  assert.deepEqual(view.map((g) => g.bucket), ["revenue", "fees", "taxes"]);

  const revenue = view[0];
  assert.equal(revenue.positive, true);
  assert.equal(revenue.lineCount, 2);
  assert.equal(revenue.subtotalText, "+IDR 302.8M"); // (284.6 + 18.2)
  assert.equal(revenue.lines[0].bold, true); // lead revenue line bold
  assert.equal(revenue.lines[0].amountText, "+IDR 284.6M");
  assert.equal(revenue.lines[0].explainerKey, "revenue");

  const fees = view[1];
  assert.equal(fees.positive, false);
  assert.equal(fees.lines[0].amountText, "−IDR 6.8M"); // deducted, minus sign
  assert.equal(view[2].lines[0].explainerKey, "phr");
});
