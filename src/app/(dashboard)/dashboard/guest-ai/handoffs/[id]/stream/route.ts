import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestAiHandoffs } from "@/lib/db/schema/guest-ai-concierge";
import { getCurrentUserContext } from "@/features/auth/permissions";
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
  const [exists] = await db
    .select({ id: guestAiHandoffs.id })
    .from(guestAiHandoffs)
    .where(eq(guestAiHandoffs.id, id))
    .limit(1);
  if (!exists) {
    return NextResponse.json(
      { ok: false, error: "handoff_not_found" },
      { status: 404 },
    );
  }

  const cursor: StreamCursor = await seedGuestCursor(id);
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
      });
      return { events: result.events, cursor: result.cursor };
    },
  });

  return new Response(body, { headers: streamHeaders });
}
