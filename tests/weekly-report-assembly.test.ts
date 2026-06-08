/**
 * Unit tests for the pure weekly-report assembler (W2).
 * Run with: npm test
 *
 * No DB, no AI — exercises the deterministic structured-summary logic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assembleWeeklyReport,
  formatMinor,
  type WeeklyReportFacts,
} from "../src/features/ai-agents/projects/weekly-report-assembly";

function baseFacts(overrides: Partial<WeeklyReportFacts> = {}): WeeklyReportFacts {
  return {
    projectName: "Eternal Villas",
    weekStart: "2026-06-01",
    weekEnding: "2026-06-07",
    boqCurrency: "IDR",
    milestones: [],
    boqMovements: [],
    rfis: [],
    siteReports: [],
    ...overrides,
  };
}

test("formatMinor groups thousands and divides by 100 (minor units)", () => {
  // 485,000,000,000 minor = 4,850,000,000 whole units.
  assert.equal(formatMinor(485_000_000_000n, "IDR"), "IDR 4,850,000,000");
  assert.equal(formatMinor(0n, "USD"), "USD 0");
  assert.equal(formatMinor(-12_345n, "USD"), "-USD 123");
});

test("empty week is quiet and all highlights dash out", () => {
  const a = assembleWeeklyReport(baseFacts());
  assert.equal(a.isQuiet, true);
  assert.ok(a.markdown.includes("No milestone, cost, RFI, or site-report"));
  for (const h of a.highlights) {
    assert.equal(h.value, "—");
  }
});

test("counts completed milestones and surfaces at-risk in the body", () => {
  const a = assembleWeeklyReport(
    baseFacts({
      milestones: [
        {
          id: "m1",
          name: "Foundation pour",
          kind: "foundation",
          status: "done",
          targetDate: "2026-06-05",
          actualDate: "2026-06-04",
          completedThisWeek: true,
        },
        {
          id: "m2",
          name: "MEP rough-in",
          kind: "mep",
          status: "at_risk",
          targetDate: "2026-06-20",
          actualDate: null,
          completedThisWeek: false,
        },
      ],
    }),
  );
  assert.equal(a.isQuiet, false);
  const closed = a.highlights.find((h) => h.label === "Milestones closed");
  assert.equal(closed?.value, "1");
  assert.ok(a.markdown.includes("need attention"));
  assert.ok(a.markdown.includes("MEP rough-in"));
  assert.ok(a.markdown.includes("Completed: Foundation pour"));
});

test("nets BOQ deltas across revisions and signs the highlight", () => {
  const a = assembleWeeklyReport(
    baseFacts({
      boqMovements: [
        {
          version: 2,
          totalMinor: 500_000_000_000n,
          deltaMinor: 15_000_000_000n, // +150,000,000 whole
          note: "Added landscaping",
          snapshotAt: "2026-06-02T00:00:00.000Z",
        },
        {
          version: 3,
          totalMinor: 495_000_000_000n,
          deltaMinor: -5_000_000_000n, // -50,000,000 whole
          note: "VE on finishes",
          snapshotAt: "2026-06-05T00:00:00.000Z",
        },
      ],
    }),
  );
  const delta = a.highlights.find((h) => h.label === "BOQ delta");
  // Net = +15,000,000,000 - 5,000,000,000 = +10,000,000,000 minor = 100,000,000 whole.
  assert.equal(delta?.value, "+IDR 100,000,000");
  assert.ok(a.markdown.includes("Net BOQ movement"));
});

test("first BOQ revision has no prior delta", () => {
  const a = assembleWeeklyReport(
    baseFacts({
      boqMovements: [
        {
          version: 1,
          totalMinor: 485_000_000_000n,
          deltaMinor: null,
          note: "Initial issue",
          snapshotAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    }),
  );
  const delta = a.highlights.find((h) => h.label === "BOQ delta");
  // Single first-issue revision => net delta 0 (deltaMinor null treated as 0).
  assert.equal(delta?.value, "±IDR 0");
  assert.ok(a.markdown.includes("first issue"));
  // Net line only appears with >1 movement.
  assert.ok(!a.markdown.includes("Net BOQ movement"));
});

test("RFIs opened / closed render as a paired highlight", () => {
  const a = assembleWeeklyReport(
    baseFacts({
      rfis: [
        {
          ref: "RFI-EV-0014",
          discipline: "structural",
          priority: "high",
          openedThisWeek: true,
          closedThisWeek: false,
        },
        {
          ref: "RFI-EV-0009",
          discipline: "mep",
          priority: "medium",
          openedThisWeek: false,
          closedThisWeek: true,
        },
      ],
    }),
  );
  const rfi = a.highlights.find((h) => h.label === "RFIs opened / closed");
  assert.equal(rfi?.value, "1 / 1");
  assert.ok(a.markdown.includes("RFI-EV-0014"));
  assert.ok(a.markdown.includes("RFI-EV-0009"));
});

test("site reports aggregate count + flag blockers", () => {
  const a = assembleWeeklyReport(
    baseFacts({
      siteReports: [
        {
          reportDate: "2026-06-02",
          totalWorkersPresent: 40,
          hasBlocker: false,
          status: "reviewed",
          summary: null,
        },
        {
          reportDate: "2026-06-04",
          totalWorkersPresent: 60,
          hasBlocker: true,
          status: "flagged",
          summary: "Crane down",
        },
      ],
    }),
  );
  const sr = a.highlights.find((h) => h.label === "Site reports");
  assert.equal(sr?.value, "2");
  assert.ok(a.markdown.includes("average 50 workers"));
  assert.ok(a.markdown.includes("flagged a blocker"));
});

test("promptContext is non-empty and references the project for LLM polish", () => {
  const a = assembleWeeklyReport(
    baseFacts({
      milestones: [
        {
          id: "m1",
          name: "Frame",
          kind: "frame",
          status: "done",
          targetDate: "2026-06-06",
          actualDate: "2026-06-06",
          completedThisWeek: true,
        },
      ],
    }),
  );
  assert.ok(a.promptContext.includes("Eternal Villas"));
  assert.ok(a.promptContext.includes("Milestones completed: 1"));
});
