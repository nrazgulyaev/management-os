import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestAiHandoffs } from "@/lib/db/schema/guest-ai-concierge";
import { serviceRequests } from "@/lib/db/schema/operations";
import { hashStayToken } from "@/features/guest-stays/token";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { openConciergeSseStream } from "@/features/realtime/sse";
import {
  parseLastEventId,
  type StreamCursor,
} from "@/features/realtime/events";
import {
  pollGuestEvents,
  seedGuestCursor,
} from "@/features/guest-ai-concierge/realtime-services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel-style serverless cap; keeps the SSE loop within the
// platform's request timeout.
export const maxDuration = 300;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string; code: string }> },
) {
  const { token, code } = await context.params;
  if (!token || token.length < 16 || !code) {
    return NextResponse.json({ ok: false, error: "Invalid input." }, {
      status: 400,
    });
  }
  const tokenPrefix = token.slice(0, 8);
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const rl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  const resolved = await getStayByToken(token);
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, error: "stay_not_found" },
      { status: 404 },
    );
  }
  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: "verification_required" },
      { status: 401 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 },
    );
  }

  const [row] = await db
    .select({
      handoffId: guestAiHandoffs.id,
      tokenId: guestAiHandoffs.guestStayTokenId,
    })
    .from(guestAiHandoffs)
    .innerJoin(
      serviceRequests,
      eq(serviceRequests.id, guestAiHandoffs.serviceRequestId),
    )
    .where(eq(serviceRequests.requestCode, code))
    .limit(1);
  if (!row || row.tokenId !== resolved.stay.tokenId) {
    return NextResponse.json(
      { ok: false, error: "request_not_found" },
      { status: 404 },
    );
  }

  const handoffId = row.handoffId;
  const cursor: StreamCursor = await seedGuestCursor(handoffId);
  const lastEventId = request.headers.get("last-event-id");
  const resumed = parseLastEventId(lastEventId);

  const { body, headers: streamHeaders } = openConciergeSseStream({
    handoffId,
    initialCursor: cursor,
    resumeSeq:
      resumed && resumed.handoffPrefix === handoffId.slice(0, 8)
        ? resumed.seq
        : null,
    poll: async (cur) => {
      const result = await pollGuestEvents(cur);
      return { events: result.events, cursor: result.cursor };
    },
  });

  return new Response(body, { headers: streamHeaders });
}
