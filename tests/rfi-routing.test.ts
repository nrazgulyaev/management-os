/**
 * Unit coverage for the pure RFI loop logic (W3 RFI loop).
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("rfiStatus derives open / answered / closed from timestamps", async () => {
  const { rfiStatus } = await import("../src/features/development/rfi/rfi-routing");
  assert.equal(rfiStatus({ respondedAt: null, resolvedAt: null }), "open");
  assert.equal(rfiStatus({ respondedAt: new Date(), resolvedAt: null }), "answered");
  assert.equal(rfiStatus({ respondedAt: new Date(), resolvedAt: new Date() }), "closed");
  // resolved wins even if respondedAt is missing (closed-from-open).
  assert.equal(rfiStatus({ respondedAt: null, resolvedAt: new Date() }), "closed");
});

test("canTransition enforces the open → answered → closed FSM", async () => {
  const { canTransition } = await import("../src/features/development/rfi/rfi-routing");
  assert.equal(canTransition("open", "answered"), true);
  assert.equal(canTransition("open", "closed"), true);
  assert.equal(canTransition("answered", "closed"), true);
  // No re-opening, no self-loops.
  assert.equal(canTransition("closed", "open"), false);
  assert.equal(canTransition("closed", "answered"), false);
  assert.equal(canTransition("answered", "open"), false);
});

test("routingRolesFor prioritises discipline roles then de-duped fallback", async () => {
  const { routingRolesFor } = await import("../src/features/development/rfi/rfi-routing");
  assert.deepEqual(routingRolesFor("structural"), [
    "engineer",
    "architect",
    "pm",
    "site_supervisor",
  ]);
  assert.deepEqual(routingRolesFor("architectural"), [
    "architect",
    "pm",
    "site_supervisor",
  ]);
  // "other" maps to pm first; pm is de-duped against the fallback list.
  assert.deepEqual(routingRolesFor("other"), ["pm", "site_supervisor"]);
});

test("makeRfiRef sanitises the code and zero-pads the sequence", async () => {
  const { makeRfiRef } = await import("../src/features/development/rfi/rfi-routing");
  assert.equal(makeRfiRef("eternal-villas", 14), "RFI-ETERNA-0014");
  assert.equal(makeRfiRef("", 1), "RFI-PRJ-0001");
  assert.equal(makeRfiRef("EV08", 142), "RFI-EV08-0142");
});

test("isRfiDiscipline matches the rfis.discipline enum", async () => {
  const { isRfiDiscipline } = await import("../src/features/development/rfi/rfi-routing");
  assert.equal(isRfiDiscipline("architectural"), true);
  assert.equal(isRfiDiscipline("mep"), true);
  // "architecture" is the modal-vocab spelling, NOT the table enum.
  assert.equal(isRfiDiscipline("architecture"), false);
  assert.equal(isRfiDiscipline("bogus"), false);
});
