/**
 * Prompt 112 — Stable demo dates.  All seed rows that use 2026-Q2
 * dates are anchored here so we can shift the demo timeline forward
 * with one constant.
 */

export const DEMO_TODAY_ISO = "2026-04-30";
export const DEMO_PERIOD = {
  prev: { start: "2026-03-01", end: "2026-03-31", label: "March 2026" },
  current: { start: "2026-04-01", end: "2026-04-30", label: "April 2026" },
  next: { start: "2026-05-01", end: "2026-05-31", label: "May 2026" },
} as const;

export const DEMO_BOOKING_DATES = {
  pastConfirmedCheckIn: "2026-03-08",
  pastConfirmedCheckOut: "2026-03-12",
  upcomingDirectCheckIn: "2026-04-12",
  upcomingDirectCheckOut: "2026-04-19",
  upcomingOtaCheckIn: "2026-04-22",
  upcomingOtaCheckOut: "2026-04-26",
  ownerStayCheckIn: "2026-05-04",
  ownerStayCheckOut: "2026-05-08",
  maintenanceStart: "2026-05-12",
  maintenanceEnd: "2026-05-14",
} as const;
