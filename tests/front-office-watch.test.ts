import { test } from "node:test";
import assert from "node:assert/strict";

test("visa-watcher: severity vs checkout", async () => {
  const { visaSeverity, isVisaRisk } = await import("../src/features/front-office/watch-rules");
  const now = new Date("2026-06-10T00:00:00Z");

  // already expired
  assert.equal(visaSeverity("2026-06-01", "2026-06-20", now), "expired");
  // valid now but lapses before checkout
  assert.equal(visaSeverity("2026-06-15", "2026-06-20", now), "expires_during_stay");
  // valid through checkout
  assert.equal(visaSeverity("2026-12-31", "2026-06-20", now), "ok");
  // no expiry on file / unparseable
  assert.equal(visaSeverity(null, "2026-06-20", now), "ok");
  assert.equal(visaSeverity("not-a-date", "2026-06-20", now), "ok");

  assert.equal(isVisaRisk("2026-06-01", "2026-06-20", now), true);
  assert.equal(isVisaRisk("2026-12-31", "2026-06-20", now), false);
});

test("turnover-monitor: not-ready states are risks", async () => {
  const { isTurnoverRisk } = await import("../src/features/front-office/watch-rules");
  for (const s of ["cleaning", "dirty", "inspection", "occupied", "out_of_order", "maintenance_block"]) {
    assert.equal(isTurnoverRisk(s), true, s);
  }
  for (const s of ["ready", "unknown", "", null]) {
    assert.equal(isTurnoverRisk(s as string | null), false, String(s));
  }
});

test("vip-prep: booking override wins, else guest flag", async () => {
  const { isVipArrival } = await import("../src/features/front-office/watch-rules");
  // Booking override true/false wins regardless of the guest flag.
  assert.equal(isVipArrival(true, false), true);
  assert.equal(isVipArrival(true, null), true);
  assert.equal(isVipArrival(false, true), false);
  // NULL/undefined booking → inherit the guest flag.
  assert.equal(isVipArrival(null, true), true);
  assert.equal(isVipArrival(undefined, true), true);
  assert.equal(isVipArrival(null, false), false);
  assert.equal(isVipArrival(null, null), false);
});
