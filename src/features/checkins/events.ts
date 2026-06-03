import "server-only";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/features/audit/services";

/**
 * Cross-surface transport seam for check-in (same decision as owner-statements
 * §9): DB-state is the source of truth; each transition records a named
 * `checkin.<verb>` audit event and revalidates the Front office surfaces so the
 * operator's arrivals board reflects a guest submission with no manual refresh.
 *
 * The guest surface (`/stay/[token]/...`) is `force-dynamic`, so it re-reads on
 * its next load (it sees the issued code then) — and the action context here
 * has no token to target. Live push to the guest = Realtime, deferred.
 */
export type CheckinVerb = "submitted" | "approved" | "code_issued";

export async function emitCheckinEvent(args: {
  verb: CheckinVerb;
  checkinId: string;
  bookingId: string;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await recordAuditEvent({
    actorUserId: args.actorUserId ?? null,
    action: `checkin.${args.verb}`,
    entityType: "checkin",
    entityId: args.checkinId,
    after: { bookingId: args.bookingId, ...args.payload },
    ipAddress: null,
    userAgent: null,
  });

  revalidatePath("/dashboard/front-office");
  revalidatePath("/dashboard/front-office/arrivals");
}
