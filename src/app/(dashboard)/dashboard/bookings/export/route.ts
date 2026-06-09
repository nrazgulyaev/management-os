import { NextResponse } from "next/server";
import { listBookingsForCabinet } from "@/features/bookings/bookings-cabinet-queries";
import { toCsv } from "@/lib/export/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DONE-DEAD-BUTTONS — "Export" on the Bookings cabinet, wired to a real
 * CSV download (replaces the ComingSoon stub).
 *
 * Lives under the (dashboard) route group, so the layout's
 * enforceProductAccess("mgmt") guard already gates access. Read-only;
 * streams the bookings the caller's tenant can see (same query that backs
 * the cabinet table, just unbounded for export).
 *
 * Money is exported as both raw minor units (the source of truth) and a
 * derived USD decimal for spreadsheet readability — never lossy on the
 * minor column.
 */

const HEADERS = [
  "booking_code",
  "villa_code",
  "channel",
  "guest",
  "check_in",
  "check_out",
  "nights",
  "adults",
  "children",
  "status",
  "gross_usd_minor",
  "gross_usd",
] as const;

export async function GET() {
  // Generous cap — the cabinet table shows 25, but an export should cover
  // the working set. Bounded so a runaway portfolio can't stream forever.
  const rows = await listBookingsForCabinet(5000).catch(() => []);

  const csv = toCsv(
    HEADERS,
    rows.map((r) => [
      r.bookingCode,
      r.villaCode,
      r.channelName ?? r.channelKey ?? "",
      r.guestName ?? "",
      r.checkIn,
      r.checkOut,
      r.nights,
      r.adults,
      r.children,
      r.status,
      r.grossUsdMinor.toString(),
      (Number(r.grossUsdMinor) / 100).toFixed(2),
    ]),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
