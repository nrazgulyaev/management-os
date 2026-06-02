import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * FC-OWNER-STATEMENTS acceptance — the pure, browser-free half of the Prove
 * loop. Asserts the server-enforced state machine, the read-only invariant,
 * the auto-ack time-travel hook, the Mgmt label, and the math-decomposition
 * bucketing. The cross-surface DB/Playwright assertions live in
 * owner-statement-crosssurface.test.ts (DB-gated).
 */

test("state machine: only contract-legal transitions are reachable", async () => {
  const { canTransition, assertTransition, IllegalOwnerStateTransition } = await import(
    "../src/features/owner-statements/state-machine"
  );

  // Legal edges (FC §1).
  for (const [from, to] of [
    ["pending", "viewed"],
    ["pending", "acknowledged"],
    ["pending", "disputed"],
    ["pending", "auto_acknowledged"],
    ["viewed", "acknowledged"],
    ["viewed", "disputed"],
    ["viewed", "auto_acknowledged"],
    ["acknowledged", "disputed"],
    ["disputed", "superseded"],
    ["auto_acknowledged", "superseded"],
  ] as const) {
    assert.equal(canTransition(from, to), true, `${from}→${to} should be legal`);
    assert.doesNotThrow(() => assertTransition(from, to));
  }

  // Illegal edges rejected at the API layer.
  for (const [from, to] of [
    ["superseded", "viewed"],
    ["superseded", "disputed"],
    ["acknowledged", "viewed"],
    ["disputed", "acknowledged"],
    ["auto_acknowledged", "viewed"],
  ] as const) {
    assert.equal(canTransition(from, to), false, `${from}→${to} should be illegal`);
    assert.throws(() => assertTransition(from, to), IllegalOwnerStateTransition);
  }
});

test("canAcknowledge / canDispute reflect the transition map", async () => {
  const { canAcknowledge, canDispute } = await import(
    "../src/features/owner-statements/state-machine"
  );
  assert.equal(canAcknowledge("pending"), true);
  assert.equal(canAcknowledge("viewed"), true);
  assert.equal(canAcknowledge("disputed"), false);
  assert.equal(canAcknowledge("superseded"), false);

  // Dispute stays open after acknowledge/auto-ack; closed once superseded.
  assert.equal(canDispute("acknowledged"), true);
  assert.equal(canDispute("auto_acknowledged"), true);
  assert.equal(canDispute("superseded"), false);
});

test("read-only invariant: owner can never write a money column", async () => {
  const { assertOwnerWritable, OwnerWriteInvariantError } = await import(
    "../src/features/owner-statements/state-machine"
  );
  // Allowed owner patch.
  assert.doesNotThrow(() =>
    assertOwnerWritable({ ownerState: "viewed", ownerViewedAt: new Date(), updatedAt: new Date() }),
  );
  // Forbidden: a *_minor money field (and other Mgmt-only columns).
  assert.throws(
    () => assertOwnerWritable({ ownerState: "acknowledged", netPayoutMinor: 999n }),
    OwnerWriteInvariantError,
  );
  assert.throws(
    () => assertOwnerWritable({ supersededById: "x" }),
    OwnerWriteInvariantError,
  );
});

test("auto-ack time-travel: flips only after the 14d window, only from pending/viewed", async () => {
  const { applyAutoAck, AUTO_ACK_DAYS } = await import(
    "../src/features/owner-statements/state-machine"
  );
  const sentAt = "2026-03-01T00:00:00.000Z";
  const before = new Date("2026-03-10T00:00:00.000Z"); // 9d < 14d
  const after = new Date("2026-03-20T00:00:00.000Z"); // 19d > 14d
  assert.equal(AUTO_ACK_DAYS, 14);

  assert.equal(applyAutoAck({ current: "pending", sentAt, now: before }), "pending");
  assert.equal(applyAutoAck({ current: "pending", sentAt, now: after }), "auto_acknowledged");
  assert.equal(applyAutoAck({ current: "viewed", sentAt, now: after }), "auto_acknowledged");
  // Terminal/decided states never auto-ack.
  assert.equal(applyAutoAck({ current: "acknowledged", sentAt, now: after }), "acknowledged");
  assert.equal(applyAutoAck({ current: "disputed", sentAt, now: after }), "disputed");
});

test("mgmt label: pending/viewed collapse to the 'Awaiting' derived label", async () => {
  const { ownerStateMgmtLabel } = await import("../src/features/owner-statements/state-machine");
  assert.equal(ownerStateMgmtLabel("pending"), "Awaiting · owner has not acted");
  assert.equal(ownerStateMgmtLabel("viewed"), "Awaiting · owner has not acted");
  assert.equal(ownerStateMgmtLabel("acknowledged"), "Acknowledged");
  assert.equal(ownerStateMgmtLabel("disputed"), "Disputed");
  assert.equal(ownerStateMgmtLabel("superseded"), "Superseded");
});

test("math decomposition: line_type maps to the six owner buckets", async () => {
  const { statementCategoryBucket } = await import(
    "../src/features/owner-statements/categories"
  );
  assert.equal(statementCategoryBucket("revenue"), "revenue");
  assert.equal(statementCategoryBucket("fee"), "fees");
  assert.equal(statementCategoryBucket("tax"), "taxes");
  assert.equal(statementCategoryBucket("expense"), "expenses");
  assert.equal(statementCategoryBucket("reserve"), "reserve");
  assert.equal(statementCategoryBucket("management_fee"), "management");
  // Unknown / null fall to expenses (a deduction), never crash.
  assert.equal(statementCategoryBucket("mystery"), "expenses");
  assert.equal(statementCategoryBucket(null), "expenses");
});

test("groupLinesByBucket: canonical order, subtotals, drops empty buckets", async () => {
  const { groupLinesByBucket } = await import("../src/features/owner-statements/categories");
  const lines = [
    { lineType: "fee", amountMinor: 300n },
    { lineType: "revenue", amountMinor: 1000n },
    { lineType: "revenue", amountMinor: 200n },
    { lineType: "management_fee", amountMinor: 150n },
  ];
  const groups = groupLinesByBucket(lines, (l) => l.amountMinor);

  // Order follows BUCKET_ORDER (revenue, fees, …, management) and empties drop.
  assert.deepEqual(
    groups.map((g) => g.bucket),
    ["revenue", "fees", "management"],
  );
  const revenue = groups.find((g) => g.bucket === "revenue")!;
  assert.equal(revenue.subtotalMinor, 1200n);
  assert.equal(revenue.sign, 1);
  assert.equal(groups.find((g) => g.bucket === "fees")!.sign, -1);
});
