import { test } from "node:test";
import assert from "node:assert/strict";

test("checkin state machine: only contract-legal transitions are reachable", async () => {
  const { canTransition, assertTransition, IllegalCheckinTransition } = await import(
    "../src/features/checkins/state-machine"
  );

  for (const [from, to] of [
    ["not_started", "in_progress"],
    ["not_started", "submitted"],
    ["in_progress", "submitted"],
    ["submitted", "approved"],
    ["approved", "code_issued"],
  ] as const) {
    assert.equal(canTransition(from, to), true, `${from}→${to} legal`);
    assert.doesNotThrow(() => assertTransition(from, to));
  }

  for (const [from, to] of [
    ["not_started", "approved"],
    ["not_started", "code_issued"],
    ["submitted", "code_issued"],
    ["submitted", "submitted"],
    ["code_issued", "approved"],
    ["approved", "submitted"],
  ] as const) {
    assert.equal(canTransition(from, to), false, `${from}→${to} illegal`);
    assert.throws(() => assertTransition(from, to), IllegalCheckinTransition);
  }
});

test("checkin guards: submit / approve / code-issued / awaiting", async () => {
  const { canSubmit, canApprove, isCodeIssued, isAwaitingReview } = await import(
    "../src/features/checkins/state-machine"
  );
  assert.equal(canSubmit("not_started"), true);
  assert.equal(canSubmit("in_progress"), true);
  assert.equal(canSubmit("submitted"), false);

  assert.equal(canApprove("submitted"), true);
  assert.equal(canApprove("approved"), false);
  assert.equal(canApprove("not_started"), false);

  assert.equal(isAwaitingReview("submitted"), true);
  assert.equal(isAwaitingReview("approved"), false);

  assert.equal(isCodeIssued("code_issued"), true);
  assert.equal(isCodeIssued("approved"), false);
});
