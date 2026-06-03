import { test } from "node:test";
import assert from "node:assert/strict";

test("readiness gate blocks only KNOWN not-ready states (ready/unknown allowed)", async () => {
  const { readinessBlocksCheckin } = await import("../src/features/checkins/readiness");

  for (const s of [
    "cleaning",
    "dirty",
    "inspection",
    "occupied",
    "out_of_order",
    "maintenance_block",
  ]) {
    assert.equal(readinessBlocksCheckin(s), true, `${s} should block`);
  }

  for (const s of ["ready", "unknown", "", null, undefined]) {
    assert.equal(readinessBlocksCheckin(s as string | null | undefined), false, `${s} should allow`);
  }
});
