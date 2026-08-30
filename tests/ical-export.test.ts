/**
 * ICAL-EXPORT-1 — pure ICS builder proof (RFC 5545 essentials).
 *
 * The outbound availability feed is what OTAs (Airbnb / Booking.com / Vrbo
 * "import calendar") parse to block dates — a malformed calendar silently
 * un-blocks villas, so the byte-level invariants matter: CRLF endings,
 * 75-octet folding, TEXT escaping, all-day events with EXCLUSIVE DTEND,
 * stable UIDs, deterministic ordering. Everything here runs against the pure
 * module (no DB / no server-only).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAvailabilityIcs,
  escapeIcsText,
  foldIcsLine,
  toIcsDate,
  toIcsUtcStamp,
  utcDateFloor,
  utcDateCeil,
} from "../src/features/integrations/calendar-export/ics";

const NOW = new Date("2026-07-04T09:30:00.000Z");

test("VCALENDAR envelope + required properties", () => {
  const ics = buildAvailabilityIcs({ calendarName: "V-01", events: [], now: NOW });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /VERSION:2\.0\r\n/);
  assert.match(ics, /PRODID:/);
  assert.match(ics, /METHOD:PUBLISH\r\n/);
  assert.match(ics, /X-WR-CALNAME:V-01\r\n/);
  // Every line terminated by CRLF — no bare \n anywhere.
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false);
});

test("all-day event: VALUE=DATE with EXCLUSIVE DTEND (checkout day is free)", () => {
  const ics = buildAvailabilityIcs({
    calendarName: "V-01",
    events: [
      {
        uid: "booking-abc",
        startDate: "2026-07-10",
        endDateExclusive: "2026-07-14",
        summary: "Reserved",
      },
    ],
    now: NOW,
  });
  assert.match(ics, /DTSTART;VALUE=DATE:20260710\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20260714\r\n/);
  assert.match(ics, /UID:booking-abc@ical\.arconique\.com\r\n/);
  assert.match(ics, /DTSTAMP:20260704T093000Z\r\n/);
  assert.match(ics, /SUMMARY:Reserved\r\n/);
  assert.match(ics, /TRANSP:OPAQUE\r\n/);
});

test("deterministic ordering by (start, uid) + zero/negative spans dropped", () => {
  const ics = buildAvailabilityIcs({
    calendarName: "V-01",
    events: [
      { uid: "b", startDate: "2026-08-01", endDateExclusive: "2026-08-03", summary: "Reserved" },
      { uid: "a", startDate: "2026-08-01", endDateExclusive: "2026-08-02", summary: "Reserved" },
      { uid: "early", startDate: "2026-07-01", endDateExclusive: "2026-07-02", summary: "Reserved" },
      // Zero-span: cannot block a night → must be dropped.
      { uid: "zero", startDate: "2026-09-01", endDateExclusive: "2026-09-01", summary: "Reserved" },
      // Negative span: malformed → dropped.
      { uid: "neg", startDate: "2026-09-05", endDateExclusive: "2026-09-01", summary: "Reserved" },
    ],
    now: NOW,
  });
  const uids = [...ics.matchAll(/UID:([^@]+)@/g)].map((m) => m[1]);
  assert.deepEqual(uids, ["early", "a", "b"]);
  assert.equal(ics.includes("zero"), false);
  assert.equal(ics.includes("neg"), false);
  // Same inputs → same bytes (determinism).
  const again = buildAvailabilityIcs({
    calendarName: "V-01",
    events: [
      { uid: "a", startDate: "2026-08-01", endDateExclusive: "2026-08-02", summary: "Reserved" },
      { uid: "early", startDate: "2026-07-01", endDateExclusive: "2026-07-02", summary: "Reserved" },
      { uid: "b", startDate: "2026-08-01", endDateExclusive: "2026-08-03", summary: "Reserved" },
      { uid: "zero", startDate: "2026-09-01", endDateExclusive: "2026-09-01", summary: "Reserved" },
      { uid: "neg", startDate: "2026-09-05", endDateExclusive: "2026-09-01", summary: "Reserved" },
    ],
    now: NOW,
  });
  assert.equal(ics, again);
});

test("TEXT escaping: backslash, semicolon, comma, newline", () => {
  assert.equal(escapeIcsText("a\\b"), "a\\\\b");
  assert.equal(escapeIcsText("a;b,c"), "a\\;b\\,c");
  assert.equal(escapeIcsText("line1\nline2"), "line1\\nline2");
  assert.equal(escapeIcsText("line1\r\nline2"), "line1\\nline2");
  // Escaping applies inside the built calendar too.
  const ics = buildAvailabilityIcs({
    calendarName: "Villa; A, B",
    events: [],
    now: NOW,
  });
  assert.match(ics, /X-WR-CALNAME:Villa\\; A\\, B\r\n/);
});

test("75-octet folding: long lines fold with CRLF+space, short lines untouched", () => {
  assert.equal(foldIcsLine("SUMMARY:short"), "SUMMARY:short");
  const long = "SUMMARY:" + "x".repeat(200);
  const folded = foldIcsLine(long);
  const segments = folded.split("\r\n");
  assert.ok(segments.length > 1, "long line must fold");
  const encoder = new TextEncoder();
  for (const [i, seg] of segments.entries()) {
    assert.ok(encoder.encode(seg).length <= 75, `segment ${i} within 75 octets`);
    if (i > 0) assert.ok(seg.startsWith(" "), "continuation starts with space");
  }
  // Unfolding reproduces the original exactly.
  assert.equal(folded.replace(/\r\n /g, ""), long);
  // Multi-byte safety: folding never splits a UTF-8 character.
  const cyr = "SUMMARY:" + "ж".repeat(100);
  const foldedCyr = foldIcsLine(cyr);
  assert.equal(foldedCyr.replace(/\r\n /g, ""), cyr);
  for (const seg of foldedCyr.split("\r\n")) {
    assert.ok(encoder.encode(seg).length <= 75);
  }
});

test("date helpers: basic-format conversion + UTC floor/ceil semantics", () => {
  assert.equal(toIcsDate("2026-07-04"), "20260704");
  assert.throws(() => toIcsDate("2026/07/04"));
  assert.equal(toIcsUtcStamp(new Date("2026-07-04T09:30:00.000Z")), "20260704T093000Z");
  assert.equal(utcDateFloor(new Date("2026-07-10T15:45:00.000Z")), "2026-07-10");
  // Ceil: mid-day block-end rolls to the NEXT day (exclusive end must cover
  // the 10th); exact midnight stays put.
  assert.equal(utcDateCeil(new Date("2026-07-10T15:45:00.000Z")), "2026-07-11");
  assert.equal(utcDateCeil(new Date("2026-07-10T00:00:00.000Z")), "2026-07-10");
  // Month rollover.
  assert.equal(utcDateCeil(new Date("2026-07-31T08:00:00.000Z")), "2026-08-01");
});

test("privacy by construction: builder emits only caller-supplied generic summaries", () => {
  const ics = buildAvailabilityIcs({
    calendarName: "V-01",
    events: [
      { uid: "booking-1", startDate: "2026-07-10", endDateExclusive: "2026-07-12", summary: "Reserved" },
    ],
    now: NOW,
  });
  // Exactly one SUMMARY line and it is the generic label.
  const summaries = [...ics.matchAll(/SUMMARY:(.*)\r\n/g)].map((m) => m[1]);
  assert.deepEqual(summaries, ["Reserved"]);
});
