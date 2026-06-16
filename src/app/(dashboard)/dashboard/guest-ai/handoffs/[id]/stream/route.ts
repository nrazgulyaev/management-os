import { type NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestAiHandoffs } from "@/lib/db/schema/guest-ai-concierge";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { hasPermission } from "@/features/auth/permission-matrix";
import { openConciergeSseStream } from "@/features/realtime/sse";
import {
  parseLastEventId,
  type StreamCursor,
} from "@/features/realtime/events";
import {
  pollAdminEvents,
  seedGuestCursor,
} from "@/features/guest-ai-concierge/realtime-services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Invalid input." },
      { status: 400 },
    );
  }
  const ctx = await getCurrentUserContext();
  if (!hasPermission(ctx, "guest_ai.handoff.read")) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }
  const canSeeNotes = hasPermission(ctx, "guest_ai.handoff.notes.read");

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 },
    );
  }
  // Tenancy: the handoff must belong to the caller's org (a null org is
  // a legacy/unbackfilled row). Without this, any staff with the read
  // permission could open another tenant's handoff stream by id.
  const organizationId = await requireOrgId();
  const [exists] = await db
    .select({ id: guestAiHandoffs.id })
    .from(guestAiHandoffs)
    .where(
      and(
        eq(guestAiHandoffs.id, id),
        or(
          isNull(guestAiHandoffs.organizationId),
          eq(guestAiHandoffs.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  if (!exists) {
    return NextResponse.json(
      { ok: false, error: "handoff_not_found" },
      { status: 404 },
    );
  }

  const cursor: StreamCursor = await seedGuestCursor(id, organizationId);
  const lastEventId = request.headers.get("last-event-id");
  const resumed = parseLastEventId(lastEventId);

  const { body, headers: streamHeaders } = openConciergeSseStream({
    handoffId: id,
    initialCursor: cursor,
    resumeSeq:
      resumed && resumed.handoffPrefix === id.slice(0, 8)
        ? resumed.seq
        : null,
    poll: async (cur) => {
      const result = await pollAdminEvents({
        cursor: cur,
        canSeeNotes,
        appUserId: ctx.appUser?.id ?? null,
        organizationId,
      });
      return { events: result.events, cursor: result.cursor };
    },
  });

  return new Response(body, { headers: streamHeaders });
}
