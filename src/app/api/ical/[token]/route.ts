import { type NextRequest } from "next/server";
import { loadIcsCalendarByToken } from "@/features/integrations/calendar-export/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * ICAL-EXPORT-1 — public outbound availability feed.
 *
 * GET /api/ical/<token>.ics → text/calendar with the villa's blocking events
 * (confirmed/in-house bookings + active manual blocks; generic summaries, no
 * guest data). Authenticated purely by the capability token in the URL —
 * resolved via SHA-256 hash against villa_ical_export_tokens (active only).
 * Paste this URL into Airbnb / Booking.com / Vrbo "import calendar" so a
 * booking here blocks the villa there. Unknown/revoked tokens → plain 404
 * (no signal about which part failed).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const rawToken = token.endsWith(".ics") ? token.slice(0, -4) : token;

  const calendar = await loadIcsCalendarByToken(rawToken).catch(() => null);
  if (!calendar) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(calendar.icsBody, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${calendar.villaCode}-availability.ics"`,
      // The token URL is the credential — keep intermediaries from caching.
      "Cache-Control": "private, max-age=300",
    },
  });
}
