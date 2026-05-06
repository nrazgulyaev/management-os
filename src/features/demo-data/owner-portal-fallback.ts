/**
 * P116B — Static owner-portal demo data.  Pure module — no DB, no env,
 * no `server-only`.  When the live DB is empty for the demo owner AND
 * demo mode is enabled, owner-portal services swap in these rows so
 * the surfaces never look broken in a stakeholder demo.
 *
 * Production never invokes this fallback (gated by
 * `demoOwnerIdFallback` + `NODE_ENV !== "production"`).
 *
 * No PII.  Owner-safe projections only.
 */

import { DEMO_OWNER_IDS, DEMO_VILLA_IDS, DEMO_PROJECT_IDS } from "./demo-ids";
import type {
  OwnerBookingPublicStatus,
  OwnerBookingSourceType,
} from "../owner-bookings/calendar-pure";

const FALLBACK_OWNER_ID = DEMO_OWNER_IDS.emma;
const VILLA_ENSO_S5 = DEMO_VILLA_IDS["ES-S5"];
const VILLA_ETERNAL_S5 = DEMO_VILLA_IDS["EV-S5"];
const VILLA_AHAU_02 = DEMO_VILLA_IDS["AH-02"];

export const DEMO_OWNER_CONTEXT = {
  ownerId: FALLBACK_OWNER_ID,
  villaIds: [VILLA_ENSO_S5, VILLA_ETERNAL_S5, VILLA_AHAU_02],
  villaCodes: ["ES-S5", "EV-S5", "AH-02"] as const,
};

// ----------------------------------------------------------------------------
// Date helpers — use a stable "today" relative to the current calendar so the
// demo is always inside a visible window.
// ----------------------------------------------------------------------------

function today(): Date {
  return new Date();
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function monthIsoFor(d: Date): string {
  // First-of-month ISO string (YYYY-MM-DD).
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// ----------------------------------------------------------------------------
// Owner bookings — 8 rows across direct / OTA / owner-stay / maintenance / hold
// ----------------------------------------------------------------------------

export interface DemoOwnerBookingRow {
  id: string;
  ownerId: string;
  villaId: string;
  villaCode: string;
  villaName: string;
  projectId: string | null;
  projectName: string | null;
  bookingId: string | null;
  directBookingRequestId: string | null;
  directBookingHoldId: string | null;
  sourceType: OwnerBookingSourceType;
  publicStatus: OwnerBookingPublicStatus;
  ownerLabel: string;
  guestLabel: string | null;
  guestCountry: string | null;
  channelLabel: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number | null;
  totalAmountMinor: bigint | null;
  ownerRevenueMinor: bigint | null;
  currency: string | null;
  revenuePosted: boolean;
  statementId: string | null;
  statementHref: string | null;
  ownerVisible: boolean;
  sourceUpdatedAt: string | null;
}

export function listDemoOwnerBookings(): DemoOwnerBookingRow[] {
  const t = today();
  const rows: Array<{
    daysOffset: number;
    nights: number;
    villaId: string;
    villaCode: string;
    villaName: string;
    sourceType: OwnerBookingSourceType;
    publicStatus: OwnerBookingPublicStatus;
    guestLabel: string | null;
    guestCountry: string | null;
    channelLabel: string | null;
    totalAmountMinor: bigint | null;
    ownerRevenueMinor: bigint | null;
    revenuePosted: boolean;
    ownerLabel: string;
  }> = [
    {
      daysOffset: -25,
      nights: 5,
      villaId: VILLA_ENSO_S5,
      villaCode: "ES-S5",
      villaName: "Enso S5",
      sourceType: "direct_booking",
      publicStatus: "completed",
      guestLabel: "Emma W.",
      guestCountry: "GB",
      channelLabel: "Direct",
      totalAmountMinor: 38_500_000_00n,
      ownerRevenueMinor: 31_400_000_00n,
      revenuePosted: true,
      ownerLabel: "Direct booking · 5 nights",
    },
    {
      daysOffset: -12,
      nights: 4,
      villaId: VILLA_ETERNAL_S5,
      villaCode: "EV-S5",
      villaName: "Eternal S5",
      sourceType: "direct_booking",
      publicStatus: "completed",
      guestLabel: "Daniel K.",
      guestCountry: "DE",
      channelLabel: "Direct",
      totalAmountMinor: 26_400_000_00n,
      ownerRevenueMinor: 21_600_000_00n,
      revenuePosted: true,
      ownerLabel: "Direct booking · 4 nights",
    },
    {
      daysOffset: 3,
      nights: 6,
      villaId: VILLA_AHAU_02,
      villaCode: "AH-02",
      villaName: "Ahau 02",
      sourceType: "direct_booking",
      publicStatus: "deposit_pending",
      guestLabel: "Sofia M.",
      guestCountry: "ES",
      channelLabel: "Direct (pending deposit)",
      totalAmountMinor: 42_000_000_00n,
      ownerRevenueMinor: null,
      revenuePosted: false,
      ownerLabel: "Direct booking · pending deposit",
    },
    {
      daysOffset: 14,
      nights: 5,
      villaId: VILLA_ENSO_S5,
      villaCode: "ES-S5",
      villaName: "Enso S5",
      sourceType: "ota_airbnb",
      publicStatus: "confirmed",
      guestLabel: "Liam P.",
      guestCountry: "AU",
      channelLabel: "Airbnb",
      totalAmountMinor: 33_750_000_00n,
      ownerRevenueMinor: 24_950_000_00n,
      revenuePosted: false,
      ownerLabel: "Airbnb · 5 nights",
    },
    {
      daysOffset: 28,
      nights: 7,
      villaId: VILLA_ETERNAL_S5,
      villaCode: "EV-S5",
      villaName: "Eternal S5",
      sourceType: "ota_booking_com",
      publicStatus: "confirmed",
      guestLabel: "Aiko T.",
      guestCountry: "JP",
      channelLabel: "Booking.com",
      totalAmountMinor: 47_250_000_00n,
      ownerRevenueMinor: 33_975_000_00n,
      revenuePosted: false,
      ownerLabel: "Booking.com · 7 nights",
    },
    {
      daysOffset: 40,
      nights: 4,
      villaId: VILLA_ENSO_S5,
      villaCode: "ES-S5",
      villaName: "Enso S5",
      sourceType: "owner_stay",
      publicStatus: "owner_stay",
      guestLabel: null,
      guestCountry: null,
      channelLabel: null,
      totalAmountMinor: null,
      ownerRevenueMinor: -2_400_000_00n,
      revenuePosted: false,
      ownerLabel: "Owner stay · 4 nights",
    },
    {
      daysOffset: 50,
      nights: 2,
      villaId: VILLA_ETERNAL_S5,
      villaCode: "EV-S5",
      villaName: "Eternal S5",
      sourceType: "maintenance_block",
      publicStatus: "maintenance",
      guestLabel: null,
      guestCountry: null,
      channelLabel: null,
      totalAmountMinor: null,
      ownerRevenueMinor: null,
      revenuePosted: false,
      ownerLabel: "Maintenance · 2 nights",
    },
    {
      daysOffset: 56,
      nights: 3,
      villaId: VILLA_AHAU_02,
      villaCode: "AH-02",
      villaName: "Ahau 02",
      sourceType: "internal_hold",
      publicStatus: "blocked",
      guestLabel: null,
      guestCountry: null,
      channelLabel: null,
      totalAmountMinor: null,
      ownerRevenueMinor: null,
      revenuePosted: false,
      ownerLabel: "Internal hold · 3 nights",
    },
  ];

  return rows.map((r, i) => {
    const checkInDate = shiftDays(t, r.daysOffset);
    const checkOutDate = shiftDays(checkInDate, r.nights);
    return {
      id: `demo-owner-booking-${String(i + 1).padStart(2, "0")}`,
      ownerId: FALLBACK_OWNER_ID,
      villaId: r.villaId,
      villaCode: r.villaCode,
      villaName: r.villaName,
      projectId: r.villaCode.startsWith("ES")
        ? DEMO_PROJECT_IDS.enso
        : r.villaCode.startsWith("EV")
          ? DEMO_PROJECT_IDS.eternal
          : DEMO_PROJECT_IDS.ahau,
      projectName: r.villaCode.startsWith("ES")
        ? "Enso Villas"
        : r.villaCode.startsWith("EV")
          ? "Eternal Villas"
          : "Ahau Villas",
      bookingId: null,
      directBookingRequestId: null,
      directBookingHoldId: null,
      sourceType: r.sourceType,
      publicStatus: r.publicStatus,
      ownerLabel: r.ownerLabel,
      guestLabel: r.guestLabel,
      guestCountry: r.guestCountry,
      channelLabel: r.channelLabel,
      checkIn: ymd(checkInDate),
      checkOut: ymd(checkOutDate),
      nights: r.nights,
      guestCount: r.guestLabel ? 4 : null,
      totalAmountMinor: r.totalAmountMinor,
      ownerRevenueMinor: r.ownerRevenueMinor,
      currency: "IDR",
      revenuePosted: r.revenuePosted,
      statementId: null,
      statementHref: null,
      ownerVisible: true,
      sourceUpdatedAt: new Date().toISOString(),
    };
  });
}

// ----------------------------------------------------------------------------
// Monthly revenue source mix — 6 rows across 3 months
// ----------------------------------------------------------------------------

export interface DemoRevenueMonthlyRow {
  ownerId: string;
  villaId: string | null;
  projectId: string | null;
  periodMonth: string;
  sourceType:
    | "direct_booking"
    | "ota"
    | "service_upsell"
    | "owner_stay"
    | "manual"
    | "other";
  grossRevenueMinor: bigint;
  deductionsMinor: bigint;
  netOwnerEffectMinor: bigint;
  bookingCount: number;
  occupiedNights: number;
  currency: string;
}

export function listDemoOwnerRevenueMonthly(): DemoRevenueMonthlyRow[] {
  const t = today();
  const thisMonth = monthIsoFor(t);
  const lastMonth = monthIsoFor(shiftDays(t, -32));
  const monthBefore = monthIsoFor(shiftDays(t, -62));

  return [
    // This month
    {
      ownerId: FALLBACK_OWNER_ID,
      villaId: VILLA_ENSO_S5,
      projectId: DEMO_PROJECT_IDS.enso,
      periodMonth: thisMonth,
      sourceType: "direct_booking",
      grossRevenueMinor: 65_000_000_00n,
      deductionsMinor: 12_500_000_00n,
      netOwnerEffectMinor: 52_500_000_00n,
      bookingCount: 2,
      occupiedNights: 9,
      currency: "IDR",
    },
    {
      ownerId: FALLBACK_OWNER_ID,
      villaId: VILLA_ETERNAL_S5,
      projectId: DEMO_PROJECT_IDS.eternal,
      periodMonth: thisMonth,
      sourceType: "ota",
      grossRevenueMinor: 47_250_000_00n,
      deductionsMinor: 13_275_000_00n,
      netOwnerEffectMinor: 33_975_000_00n,
      bookingCount: 1,
      occupiedNights: 7,
      currency: "IDR",
    },
    {
      ownerId: FALLBACK_OWNER_ID,
      villaId: VILLA_ENSO_S5,
      projectId: DEMO_PROJECT_IDS.enso,
      periodMonth: thisMonth,
      sourceType: "service_upsell",
      grossRevenueMinor: 4_350_000_00n,
      deductionsMinor: 870_000_00n,
      netOwnerEffectMinor: 3_480_000_00n,
      bookingCount: 6,
      occupiedNights: 0,
      currency: "IDR",
    },
    {
      ownerId: FALLBACK_OWNER_ID,
      villaId: VILLA_ENSO_S5,
      projectId: DEMO_PROJECT_IDS.enso,
      periodMonth: thisMonth,
      sourceType: "owner_stay",
      grossRevenueMinor: 0n,
      deductionsMinor: 2_400_000_00n,
      netOwnerEffectMinor: -2_400_000_00n,
      bookingCount: 1,
      occupiedNights: 4,
      currency: "IDR",
    },
    // Last month
    {
      ownerId: FALLBACK_OWNER_ID,
      villaId: VILLA_ENSO_S5,
      projectId: DEMO_PROJECT_IDS.enso,
      periodMonth: lastMonth,
      sourceType: "direct_booking",
      grossRevenueMinor: 38_500_000_00n,
      deductionsMinor: 7_100_000_00n,
      netOwnerEffectMinor: 31_400_000_00n,
      bookingCount: 1,
      occupiedNights: 5,
      currency: "IDR",
    },
    {
      ownerId: FALLBACK_OWNER_ID,
      villaId: VILLA_ETERNAL_S5,
      projectId: DEMO_PROJECT_IDS.eternal,
      periodMonth: lastMonth,
      sourceType: "ota",
      grossRevenueMinor: 33_750_000_00n,
      deductionsMinor: 8_800_000_00n,
      netOwnerEffectMinor: 24_950_000_00n,
      bookingCount: 1,
      occupiedNights: 5,
      currency: "IDR",
    },
    // Two months ago
    {
      ownerId: FALLBACK_OWNER_ID,
      villaId: VILLA_ETERNAL_S5,
      projectId: DEMO_PROJECT_IDS.eternal,
      periodMonth: monthBefore,
      sourceType: "direct_booking",
      grossRevenueMinor: 26_400_000_00n,
      deductionsMinor: 4_800_000_00n,
      netOwnerEffectMinor: 21_600_000_00n,
      bookingCount: 1,
      occupiedNights: 4,
      currency: "IDR",
    },
  ];
}

// ----------------------------------------------------------------------------
// Owner stay requests — 4 rows
// ----------------------------------------------------------------------------

export interface DemoOwnerStayRequest {
  id: string;
  ownerId: string;
  villaId: string;
  villaCode: string;
  villaName: string;
  status:
    | "requested"
    | "pending_admin_review"
    | "approved"
    | "completed"
    | "charges_posted"
    | "cancelled";
  publicStatusLabel: string;
  startDate: string;
  endDate: string;
  guests: number;
  notes: string | null;
  policyAllowanceLabel: string;
  createdAt: string;
}

export function listDemoOwnerStayRequests(): DemoOwnerStayRequest[] {
  const t = today();
  const rows: Array<Omit<DemoOwnerStayRequest, "id" | "ownerId">> = [
    {
      villaId: VILLA_ENSO_S5,
      villaCode: "ES-S5",
      villaName: "Enso S5",
      status: "requested",
      publicStatusLabel: "Requested",
      startDate: ymd(shiftDays(t, 35)),
      endDate: ymd(shiftDays(t, 39)),
      guests: 4,
      notes: "Family birthday weekend.",
      policyAllowanceLabel: "Within annual allowance",
      createdAt: new Date().toISOString(),
    },
    {
      villaId: VILLA_ETERNAL_S5,
      villaCode: "EV-S5",
      villaName: "Eternal S5",
      status: "pending_admin_review",
      publicStatusLabel: "Awaiting admin review",
      startDate: ymd(shiftDays(t, 60)),
      endDate: ymd(shiftDays(t, 64)),
      guests: 2,
      notes: "Quiet retreat — no guest services needed.",
      policyAllowanceLabel: "Outside peak window",
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      villaId: VILLA_ENSO_S5,
      villaCode: "ES-S5",
      villaName: "Enso S5",
      status: "approved",
      publicStatusLabel: "Approved · cleaning fee applies",
      startDate: ymd(shiftDays(t, 14)),
      endDate: ymd(shiftDays(t, 18)),
      guests: 6,
      notes: null,
      policyAllowanceLabel: "Within annual allowance",
      createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    },
    {
      villaId: VILLA_AHAU_02,
      villaCode: "AH-02",
      villaName: "Ahau 02",
      status: "charges_posted",
      publicStatusLabel: "Completed · charges posted",
      startDate: ymd(shiftDays(t, -28)),
      endDate: ymd(shiftDays(t, -24)),
      guests: 4,
      notes: "Quarterly site visit.",
      policyAllowanceLabel: "Site-visit allowance",
      createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    },
  ];

  return rows.map((r, i) => ({
    id: `demo-owner-stay-${String(i + 1).padStart(2, "0")}`,
    ownerId: FALLBACK_OWNER_ID,
    ...r,
  }));
}

// ----------------------------------------------------------------------------
// Owner inbox notifications — 6 rows
// ----------------------------------------------------------------------------

export interface DemoOwnerInboxNotification {
  id: string;
  ownerId: string;
  templateKey: string;
  title: string;
  body: string;
  status: "unread" | "read" | "archived";
  createdAt: string;
  href: string | null;
}

export function listDemoOwnerInboxNotifications(): DemoOwnerInboxNotification[] {
  const t = today();
  const minutesAgo = (m: number) =>
    new Date(t.getTime() - m * 60_000).toISOString();
  return [
    {
      id: "demo-inbox-01",
      ownerId: FALLBACK_OWNER_ID,
      templateKey: "owner.statement.issued",
      title: "Your March 2026 statement is ready",
      body: "Issued and signed; net owner effect is on its way to your nominated payout account.",
      status: "unread",
      createdAt: minutesAgo(120),
      href: "/owner/statements",
    },
    {
      id: "demo-inbox-02",
      ownerId: FALLBACK_OWNER_ID,
      templateKey: "owner.payout.scheduled",
      title: "Payout scheduled — Rp 47.4M",
      body: "Your payout will leave the operator account on the next business day.",
      status: "unread",
      createdAt: minutesAgo(240),
      href: "/owner/statements",
    },
    {
      id: "demo-inbox-03",
      ownerId: FALLBACK_OWNER_ID,
      templateKey: "owner.maintenance.completed",
      title: "Maintenance complete · Eternal S5",
      body: "Quarterly AC service completed and signed off by the technician.",
      status: "unread",
      createdAt: minutesAgo(60 * 24),
      href: "/owner/villas",
    },
    {
      id: "demo-inbox-04",
      ownerId: FALLBACK_OWNER_ID,
      templateKey: "owner.stay.approved",
      title: "Owner stay approved · Enso S5",
      body: "Your request for the family birthday weekend has been approved.",
      status: "read",
      createdAt: minutesAgo(60 * 48),
      href: "/owner/stays",
    },
    {
      id: "demo-inbox-05",
      ownerId: FALLBACK_OWNER_ID,
      templateKey: "owner.direct_booking.posted",
      title: "Direct booking posted · Enso S5",
      body: "Emma W. checked out; Rp 31.4M is now reflected in your owner statement.",
      status: "read",
      createdAt: minutesAgo(60 * 72),
      href: "/owner/bookings",
    },
    {
      id: "demo-inbox-06",
      ownerId: FALLBACK_OWNER_ID,
      templateKey: "owner.calendar.updated",
      title: "Calendar updated · Eternal S5",
      body: "An OTA stay was added for late next month. Open the calendar to review.",
      status: "read",
      createdAt: minutesAgo(60 * 96),
      href: "/owner/calendar",
    },
  ];
}

// ----------------------------------------------------------------------------
// Demo predicate
// ----------------------------------------------------------------------------

export function isDemoOwnerFallbackActive(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  return (
    env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "1" ||
    env.ARCONIQUE_FORCE_MOCK === "1"
  );
}

export function isDemoFallbackOwnerId(ownerId: string): boolean {
  return ownerId === FALLBACK_OWNER_ID;
}
