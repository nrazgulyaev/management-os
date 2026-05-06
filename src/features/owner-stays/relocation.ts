import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bookingRelocationCandidates,
  ownerStayRequests,
  villaEquivalenceGroupMembers,
} from "@/lib/db/schema/owner-stays";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { villas } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import {
  bookingDatesToBlockRange,
  detectConflicts,
} from "@/features/availability/calendar";
import { syncBookingCalendarBlock } from "@/features/availability/services";
import {
  evaluateCandidate,
  impactLevelFromDelta,
  type EquivalenceMembership,
} from "./relocation-rules";

/**
 * V9B — relocation candidate engine. Discovers safe swap targets for
 * guest bookings that conflict with an approved-but-pending owner stay,
 * surfaces them for admin review, and applies them on demand.
 *
 * Owners must NEVER read this surface. RLS keeps `booking_relocation_
 * candidates` internal-only.
 */

export interface RelocationCandidateRow {
  id: string;
  ownerStayRequestId: string;
  bookingId: string;
  bookingCode: string | null;
  fromVillaId: string;
  fromVillaCode: string | null;
  toVillaId: string;
  toVillaCode: string | null;
  candidateStatus: string;
  score: number;
  guestImpactLevel: string;
  reason: string | null;
  revenueDifferenceMinor: number;
  currency: string;
  requiresGuestNotification: boolean;
  approvedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
}

export async function listRelocationCandidates(
  ownerStayRequestId: string,
): Promise<RelocationCandidateRow[]> {
  const db = getDb();
  if (!db) return [];
  const fromVilla = villas;
  const toVilla = villas; // alias-less workaround; we project both via raw sql below.
  const rows = await db
    .select({
      c: bookingRelocationCandidates,
      bookingCode: bookings.bookingCode,
    })
    .from(bookingRelocationCandidates)
    .leftJoin(bookings, eq(bookings.id, bookingRelocationCandidates.bookingId))
    .where(
      eq(bookingRelocationCandidates.ownerStayRequestId, ownerStayRequestId),
    )
    .orderBy(desc(bookingRelocationCandidates.score));

  // Pull villa codes in a separate query (one round trip).
  const villaIds = Array.from(
    new Set(
      rows.flatMap((r) => [r.c.fromVillaId, r.c.toVillaId]),
    ),
  );
  let codeMap: Record<string, string> = {};
  if (villaIds.length > 0) {
    const v = await db
      .select({ id: fromVilla.id, code: toVilla.unitCode })
      .from(fromVilla)
      .where(inArray(fromVilla.id, villaIds));
    codeMap = v.reduce<Record<string, string>>((acc, row) => {
      acc[row.id] = row.code;
      return acc;
    }, {});
  }

  return rows.map((r) => ({
    id: r.c.id,
    ownerStayRequestId: r.c.ownerStayRequestId,
    bookingId: r.c.bookingId,
    bookingCode: r.bookingCode ?? null,
    fromVillaId: r.c.fromVillaId,
    fromVillaCode: codeMap[r.c.fromVillaId] ?? null,
    toVillaId: r.c.toVillaId,
    toVillaCode: codeMap[r.c.toVillaId] ?? null,
    candidateStatus: r.c.candidateStatus,
    score: Number(r.c.score),
    guestImpactLevel: r.c.guestImpactLevel,
    reason: r.c.reason,
    revenueDifferenceMinor: Number(r.c.revenueDifferenceMinor),
    currency: r.c.currency,
    requiresGuestNotification: r.c.requiresGuestNotification,
    approvedAt: r.c.approvedAt?.toISOString() ?? null,
    appliedAt: r.c.appliedAt?.toISOString() ?? null,
    createdAt: r.c.createdAt.toISOString(),
  }));
}

/**
 * Discover candidates and persist them. Idempotent — clears any
 * `candidate` rows for this request first so re-running picks up
 * schedule changes. `approved` and `applied` rows are preserved.
 */
export async function findRelocationCandidates(
  ownerStayRequestId: string,
): Promise<{ created: number }> {
  const db = getDb();
  if (!db) return { created: 0 };

  const [req] = await db
    .select()
    .from(ownerStayRequests)
    .where(eq(ownerStayRequests.id, ownerStayRequestId))
    .limit(1);
  if (!req) return { created: 0 };

  // Re-quote the owner-stay window as a UTC range.
  const { startsAt: ownerStartsAt, endsAt: ownerEndsAt } =
    bookingDatesToBlockRange(
      req.requestedStart as unknown as string,
      req.requestedEnd as unknown as string,
    );

  // Find conflicting active guest bookings on the requested villa.
  const conflictingBlocks = await db
    .select({
      id: villaCalendarBlocks.id,
      sourceId: villaCalendarBlocks.sourceId,
      villaId: villaCalendarBlocks.villaId,
      blockType: villaCalendarBlocks.blockType,
      status: villaCalendarBlocks.status,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.villaId, req.villaId),
        eq(villaCalendarBlocks.status, "active"),
        eq(villaCalendarBlocks.blockType, "guest_booking"),
      ),
    );
  const overlapping = conflictingBlocks.filter(
    (b) =>
      new Date(b.startsAt).getTime() < ownerEndsAt.getTime() &&
      new Date(b.endsAt).getTime() > ownerStartsAt.getTime(),
  );
  if (overlapping.length === 0) {
    // Nothing to relocate — clear stale candidate rows and return.
    await db
      .delete(bookingRelocationCandidates)
      .where(
        and(
          eq(
            bookingRelocationCandidates.ownerStayRequestId,
            ownerStayRequestId,
          ),
          eq(bookingRelocationCandidates.candidateStatus, "candidate"),
        ),
      );
    return { created: 0 };
  }

  // Equivalence membership for the source villa.
  const memberships = await db
    .select()
    .from(villaEquivalenceGroupMembers)
    .where(
      and(
        eq(villaEquivalenceGroupMembers.villaId, req.villaId),
        eq(villaEquivalenceGroupMembers.status, "active"),
      ),
    );
  if (memberships.length === 0) {
    return { created: 0 };
  }
  const sourceMembership = memberships[0];

  // All other active group members — these are the candidate target villas.
  const groupMembers = await db
    .select({
      m: villaEquivalenceGroupMembers,
      villaStatus: villas.status,
    })
    .from(villaEquivalenceGroupMembers)
    .leftJoin(villas, eq(villas.id, villaEquivalenceGroupMembers.villaId))
    .where(
      and(
        eq(villaEquivalenceGroupMembers.groupId, sourceMembership.groupId),
        eq(villaEquivalenceGroupMembers.status, "active"),
      ),
    );

  // Drop existing `candidate` rows so we can re-discover.
  await db
    .delete(bookingRelocationCandidates)
    .where(
      and(
        eq(bookingRelocationCandidates.ownerStayRequestId, ownerStayRequestId),
        eq(bookingRelocationCandidates.candidateStatus, "candidate"),
      ),
    );

  let created = 0;
  for (const block of overlapping) {
    if (!block.sourceId) continue;
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, block.sourceId))
      .limit(1);
    if (!booking) continue;
    if (booking.status === "cancelled" || booking.status === "no_show") continue;

    for (const member of groupMembers) {
      if (member.m.villaId === req.villaId) continue;

      // Pull active blocks on the candidate target intersecting the booking.
      const targetBlocks = await db
        .select()
        .from(villaCalendarBlocks)
        .where(
          and(
            eq(villaCalendarBlocks.villaId, member.m.villaId),
            eq(villaCalendarBlocks.status, "active"),
          ),
        );
      const bookingStartTs = `${booking.checkIn as unknown as string}T00:00:00Z`;
      const bookingEndTs = `${booking.checkOut as unknown as string}T00:00:00Z`;
      const evaluation = evaluateCandidate({
        booking: {
          id: booking.id,
          villaId: booking.villaId,
          checkIn: booking.checkIn as unknown as string,
          checkOut: booking.checkOut as unknown as string,
        },
        targetActiveBlocks: targetBlocks,
        targetVilla: {
          id: member.m.villaId,
          status: member.villaStatus ?? "unknown",
        },
        fromMembership: {
          villaId: sourceMembership.villaId,
          groupId: sourceMembership.groupId,
          qualityRank: sourceMembership.qualityRank,
          status: sourceMembership.status,
        } satisfies EquivalenceMembership,
        targetMembership: {
          villaId: member.m.villaId,
          groupId: member.m.groupId,
          qualityRank: member.m.qualityRank,
          status: member.m.status,
        } satisfies EquivalenceMembership,
      });

      // Avoid lint warnings on temp variables we keep for clarity.
      void bookingStartTs;
      void bookingEndTs;

      if (!evaluation.ok) continue;

      await db.insert(bookingRelocationCandidates).values({
        ownerStayRequestId,
        bookingId: booking.id,
        fromVillaId: booking.villaId,
        toVillaId: member.m.villaId,
        candidateStatus: "candidate",
        score: String(evaluation.score),
        guestImpactLevel: impactLevelFromDelta(evaluation.qualityDelta),
        reason: evaluation.qualityDelta < 0 ? "upgrade" : "equivalent",
        revenueDifferenceMinor: 0,
        currency: booking.currency,
        requiresGuestNotification: evaluation.qualityDelta >= 0,
      });
      created++;
    }
  }

  // Mark request status if it isn't already.
  if (
    req.status !== "approved" &&
    req.status !== "completed" &&
    req.status !== "cancelled" &&
    req.status !== "rejected"
  ) {
    await db
      .update(ownerStayRequests)
      .set({
        status: "requires_relocation",
        relocationRequired: true,
        relocationPossible: created > 0,
        updatedAt: new Date(),
      })
      .where(eq(ownerStayRequests.id, ownerStayRequestId));
  }

  return { created };
}

/**
 * Apply an approved relocation candidate: re-point the booking, re-sync
 * its calendar block, mark the candidate `applied`. Audit-logged. Other
 * candidates for the same booking are marked `expired` so they can't be
 * applied twice.
 */
export async function applyRelocationCandidate(
  candidateId: string,
  actorUserId: string | null,
): Promise<{ ok: boolean; bookingId?: string; toVillaId?: string; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no db" };
  const [c] = await db
    .select()
    .from(bookingRelocationCandidates)
    .where(eq(bookingRelocationCandidates.id, candidateId))
    .limit(1);
  if (!c) return { ok: false, reason: "candidate not found" };
  if (c.candidateStatus !== "approved") {
    return {
      ok: false,
      reason: `candidate must be approved before apply (status=${c.candidateStatus})`,
    };
  }

  // Re-validate against live state (target may have been booked since approval).
  const targetBlocks = await db
    .select()
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.villaId, c.toVillaId),
        eq(villaCalendarBlocks.status, "active"),
      ),
    );
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, c.bookingId))
    .limit(1);
  if (!booking) return { ok: false, reason: "booking gone" };
  const conflicts = detectConflicts(targetBlocks, {
    villaId: c.toVillaId,
    startsAt: `${booking.checkIn as unknown as string}T00:00:00Z`,
    endsAt: `${booking.checkOut as unknown as string}T00:00:00Z`,
  });
  if (conflicts.length > 0) {
    return { ok: false, reason: "target villa now has conflicts" };
  }

  await db
    .update(bookings)
    .set({ villaId: c.toVillaId, updatedAt: new Date() })
    .where(eq(bookings.id, c.bookingId));

  // Re-sync the booking's calendar block.
  await syncBookingCalendarBlock(c.bookingId, actorUserId);

  await db
    .update(bookingRelocationCandidates)
    .set({
      candidateStatus: "applied",
      appliedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookingRelocationCandidates.id, candidateId));

  // Expire other candidates for the same booking.
  await db
    .update(bookingRelocationCandidates)
    .set({ candidateStatus: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(bookingRelocationCandidates.bookingId, c.bookingId),
        eq(bookingRelocationCandidates.candidateStatus, "candidate"),
      ),
    );

  return { ok: true, bookingId: c.bookingId, toVillaId: c.toVillaId };
}

/**
 * Score helper exposed for the admin UI table — pure, called per-row.
 */
export function scoreRelocationCandidate(score: number | string): number {
  const n = typeof score === "number" ? score : Number(score ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

// Suppress unused-import warnings.
export const _drizzleHelpers = { asc };
