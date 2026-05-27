import { NextResponse } from "next/server";
import { listVillas } from "@/features/villas/services";
import { listOwners } from "@/features/owners/services";
import { listBookings } from "@/features/bookings/services";
import type { CommandRecord } from "@/features/command-palette/types";

/**
 * Phase 2.1 PR 3 — Command-palette record index.
 *
 * Returns up to 10k tenant-visible records (villas + owners +
 * bookings) for the client-side FlexSearch index. Auth is enforced
 * upstream by the `(dashboard)` layout's `enforceProductAccess`
 * guard — this route is only reachable from a logged-in Mgmt
 * session. Records carry a precomputed `haystack` string so the
 * client can index a single field.
 *
 * Future expansion: statements, projects, vendors. Capped to keep
 * the initial payload under ~1MB on the wire even with 10k rows.
 */

export const dynamic = "force-dynamic";

const TOTAL_CAP = 10_000;
const PER_KIND_CAP = 3_000;

export async function GET() {
  const records: CommandRecord[] = [];

  try {
    const villas = (await listVillas().catch(() => [])).slice(0, PER_KIND_CAP);
    for (const v of villas) {
      records.push({
        id: `villa-${v.id}`,
        label: v.name ?? v.unitCode,
        meta: `Villa · ${v.unitCode} · ${v.projectName}`,
        href: `/dashboard/villas/${v.id}`,
        haystack: [v.unitCode, v.name, v.slug, v.projectName].filter(Boolean).join(" "),
        kind: "villa",
      });
    }
  } catch {
    // tolerate missing source; other kinds still load
  }

  try {
    const owners = (await listOwners().catch(() => [])).slice(0, PER_KIND_CAP);
    for (const o of owners) {
      records.push({
        id: `owner-${o.id}`,
        label: o.displayName,
        meta: `Owner · ${o.type.replace("_", " ")}`,
        href: `/dashboard/owners/${o.id}`,
        haystack: [o.displayName, o.legalName, o.email].filter(Boolean).join(" "),
        kind: "owner",
      });
    }
  } catch {
    // ignore
  }

  try {
    const bookings = (await listBookings().catch(() => [])).slice(0, PER_KIND_CAP);
    for (const b of bookings) {
      records.push({
        id: `booking-${b.id}`,
        label: b.bookingCode,
        meta: `Booking · ${b.villaCode ?? "—"} · ${b.guestName ?? "Guest"}`,
        href: `/dashboard/bookings/${b.id}`,
        haystack: [b.bookingCode, b.villaCode, b.guestName].filter(Boolean).join(" "),
        kind: "booking",
      });
    }
  } catch {
    // ignore
  }

  return NextResponse.json({
    records: records.slice(0, TOTAL_CAP),
  });
}
