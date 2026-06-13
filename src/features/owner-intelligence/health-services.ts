import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema/bookings";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import {
  maintenanceTickets,
  operationTasks,
  preventiveSchedules,
} from "@/lib/db/schema/operations";
import { maintenanceRiskEvents } from "@/lib/db/schema/maintenance-intelligence";
import { villas, projects } from "@/lib/db/schema/projects";
import {
  guestReviews,
  villaHealthSnapshots,
  type VillaHealthSnapshot,
  type NewVillaHealthSnapshot,
} from "@/lib/db/schema/owner-intelligence";
import { ownershipShares } from "@/lib/db/schema/ownership";
import {
  calculateVillaHealthScore,
  countBlockedNights,
  summarizeVillaHealthExplanation,
  type HealthInput,
  type HealthOutcome,
  type VillaHealthStatus,
} from "./health-pure";
import { listOwnerIdsForCurrentUser } from "@/features/notifications/services";

/**
 * Health services — assemble the inputs from canonical sources, run
 * the pure scorer, persist a snapshot row, expose owner-safe reads.
 */

export interface ComputedHealth {
  villaId: string;
  villaName: string | null;
  periodStart: string;
  periodEnd: string;
  outcome: HealthOutcome;
  inputs: HealthInput;
  explanation: string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function nightsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const days = Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
  return Math.max(0, days);
}

export async function computeVillaHealth(
  villaId: string,
  periodStart: string,
  periodEnd: string,
  /**
   * TENANCY (write-flow IDOR): the caller's organization. This helper is
   * shared between org-scoped server pages (read) and the snapshot-write
   * actions. When non-null we assert the villa belongs to the org via its
   * project anchor (villas has no org column); a cross-org villaId then reads
   * as "not found". Read callers that don't pass an org keep legacy behavior.
   */
  organizationId: string | null = null,
): Promise<ComputedHealth | null> {
  const db = getDb();
  if (!db) return null;
  const [villa] = await db
    .select({
      id: villas.id,
      name: villas.name,
      unitCode: villas.unitCode,
    })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      organizationId
        ? and(
            eq(villas.id, villaId),
            eq(projects.organizationId, organizationId),
          )
        : eq(villas.id, villaId),
    )
    .limit(1);
  if (!villa) return null;

  // Bookings — sum nights overlapping with the period.
  const bookingRows = await db
    .select({
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.villaId, villaId),
        sql`${bookings.status} not in ('cancelled','no_show')`,
        lte(bookings.checkIn, periodEnd),
        gte(bookings.checkOut, periodStart),
      ),
    );
  let bookedNights = 0;
  for (const b of bookingRows) {
    const start = (b.checkIn as unknown as string) > periodStart
      ? (b.checkIn as unknown as string)
      : periodStart;
    const end = (b.checkOut as unknown as string) < periodEnd
      ? (b.checkOut as unknown as string)
      : periodEnd;
    bookedNights += nightsBetween(start, end);
  }

  // Owner stays.
  const ownerStayRows = await db
    .select({
      start: ownerStayRequests.requestedStart,
      end: ownerStayRequests.requestedEnd,
      status: ownerStayRequests.status,
    })
    .from(ownerStayRequests)
    .where(
      and(
        eq(ownerStayRequests.villaId, villaId),
        sql`${ownerStayRequests.status} not in ('cancelled','rejected')`,
        lte(ownerStayRequests.requestedStart, periodEnd),
        gte(ownerStayRequests.requestedEnd, periodStart),
      ),
    );
  let ownerStayNights = 0;
  for (const s of ownerStayRows) {
    const start = (s.start as unknown as string) > periodStart
      ? (s.start as unknown as string)
      : periodStart;
    const end = (s.end as unknown as string) < periodEnd
      ? (s.end as unknown as string)
      : periodEnd;
    ownerStayNights += nightsBetween(start, end);
  }

  // Maintenance / hold / out-of-order blocks.
  const blockRows = await db
    .select({
      id: villaCalendarBlocks.id,
      blockType: villaCalendarBlocks.blockType,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.villaId, villaId),
        eq(villaCalendarBlocks.status, "active"),
        lte(villaCalendarBlocks.startsAt, new Date(`${periodEnd}T23:59:59Z`)),
        sql`${villaCalendarBlocks.endsAt} > ${periodStart}::timestamptz`,
      ),
    );
  const maintenanceBlockedNights = countBlockedNights(
    blockRows.map((b) => ({
      startDate: toDateOnly(b.startsAt),
      endDate: toDateOnly(b.endsAt),
      source:
        b.blockType === "out_of_order"
          ? ("out_of_order" as const)
          : b.blockType === "internal_hold" || b.blockType === "manual"
            ? ("internal_hold" as const)
            : ("maintenance_block" as const),
    })),
    "maintenance_block",
  );

  // Operations counts.
  const opsTaskRows = await db
    .select({
      category: operationTasks.category,
      status: operationTasks.status,
      scheduledFor: operationTasks.scheduledFor,
    })
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.villaId, villaId),
        gte(operationTasks.scheduledFor, periodStart),
        lte(operationTasks.scheduledFor, periodEnd),
      ),
    );
  const housekeepingTasksCompleted = opsTaskRows.filter(
    (t) =>
      (t.category ?? "").toLowerCase().includes("housekeep") &&
      ["completed", "done", "verified"].includes(
        (t.status ?? "").toLowerCase(),
      ),
  ).length;

  // Maintenance tickets.
  const ticketRows = await db
    .select({
      status: maintenanceTickets.status,
      createdAt: maintenanceTickets.createdAt,
      closedAt: maintenanceTickets.closedAt,
    })
    .from(maintenanceTickets)
    .where(eq(maintenanceTickets.villaId, villaId));
  const maintenanceTicketsOpen = ticketRows.filter(
    (t) =>
      ["open", "scheduled", "in_progress"].includes(
        (t.status ?? "").toLowerCase(),
      ),
  ).length;
  const maintenanceTicketsCompleted = ticketRows.filter((t) => {
    if (!t.closedAt) return false;
    const closedISO = toDateOnly(t.closedAt);
    return closedISO >= periodStart && closedISO <= periodEnd;
  }).length;

  // Preventive schedules due in window.
  const preventiveRows = await db
    .select({
      nextDueOn: preventiveSchedules.nextDueOn,
      status: preventiveSchedules.status,
    })
    .from(preventiveSchedules)
    .where(eq(preventiveSchedules.villaId, villaId));
  const preventiveTasksDue = preventiveRows.filter((p) => {
    const due = (p.nextDueOn as unknown as string | null) ?? null;
    if (!due) return false;
    return due >= periodStart && due <= periodEnd;
  }).length;

  // Utility / maintenance risk events — open count for the villa.
  const utilityRisks = await db
    .select({ id: maintenanceRiskEvents.id })
    .from(maintenanceRiskEvents)
    .where(
      and(
        eq(maintenanceRiskEvents.villaId, villaId),
        sql`${maintenanceRiskEvents.status} not in ('resolved','closed','cancelled')`,
      ),
    );
  const utilityRiskCount = utilityRisks.length;

  // Reviews aggregate.
  const reviewRows = await db
    .select({
      rating: guestReviews.rating,
      sentiment: guestReviews.sentiment,
      reviewDate: guestReviews.reviewDate,
      status: guestReviews.status,
    })
    .from(guestReviews)
    .where(
      and(
        eq(guestReviews.villaId, villaId),
        eq(guestReviews.status, "published"),
        sql`(${guestReviews.reviewDate} is null or (${guestReviews.reviewDate} >= ${periodStart} and ${guestReviews.reviewDate} <= ${periodEnd}))`,
      ),
    );
  const ratings = reviewRows
    .map((r) => (r.rating !== null ? Number(r.rating) : null))
    .filter((n): n is number => n !== null);
  const averageReviewRating =
    ratings.length === 0
      ? null
      : Math.round(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100,
        ) / 100;
  const negativeReviewCount = reviewRows.filter(
    (r) => r.sentiment === "negative",
  ).length;

  const availableNights = nightsBetween(periodStart, periodEnd);
  const inputs: HealthInput = {
    bookedNights,
    availableNights,
    ownerStayNights,
    maintenanceBlockedNights,
    housekeepingTasksCompleted,
    maintenanceTicketsOpen,
    maintenanceTicketsCompleted,
    preventiveTasksDue,
    utilityRiskCount,
    averageReviewRating,
    negativeReviewCount,
    reserveBalanceMinor: null,
    reserveCurrency: null,
  };
  const outcome = calculateVillaHealthScore(inputs);
  const explanation = summarizeVillaHealthExplanation({
    ...inputs,
    villaName: villa.name ?? villa.unitCode ?? "Villa",
    periodStart,
    periodEnd,
  });
  return {
    villaId: villa.id,
    villaName: villa.name ?? villa.unitCode ?? null,
    periodStart,
    periodEnd,
    outcome,
    inputs,
    explanation,
  };
}

export async function generateVillaHealthSnapshot(
  villaId: string,
  periodStart: string,
  periodEnd: string,
  /**
   * TENANCY (write-flow IDOR): caller org. Threaded into computeVillaHealth
   * (which rejects a cross-org villa) and stamped on the snapshot row. The
   * write actions pass `await requireOrgId()`; null preserves legacy behavior.
   */
  organizationId: string | null = null,
): Promise<VillaHealthSnapshot | null> {
  const db = getDb();
  if (!db) return null;
  const computed = await computeVillaHealth(
    villaId,
    periodStart,
    periodEnd,
    organizationId,
  );
  if (!computed) return null;

  const [existing] = await db
    .select()
    .from(villaHealthSnapshots)
    .where(
      and(
        eq(villaHealthSnapshots.villaId, villaId),
        eq(villaHealthSnapshots.periodStart, periodStart),
        eq(villaHealthSnapshots.periodEnd, periodEnd),
      ),
    )
    .limit(1);

  const values = {
    villaId,
    organizationId,
    projectId: null as string | null,
    periodStart,
    periodEnd,
    occupancyRate:
      computed.inputs.availableNights === 0
        ? null
        : (
            computed.inputs.bookedNights /
            computed.inputs.availableNights
          ).toString(),
    bookedNights: computed.inputs.bookedNights,
    ownerStayNights: computed.inputs.ownerStayNights,
    maintenanceBlockedNights:
      computed.inputs.maintenanceBlockedNights,
    housekeepingTasksCompleted:
      computed.inputs.housekeepingTasksCompleted,
    maintenanceTicketsOpen: computed.inputs.maintenanceTicketsOpen,
    maintenanceTicketsCompleted:
      computed.inputs.maintenanceTicketsCompleted,
    preventiveTasksDue: computed.inputs.preventiveTasksDue,
    utilityRiskCount: computed.inputs.utilityRiskCount,
    averageReviewRating:
      computed.inputs.averageReviewRating !== null
        ? computed.inputs.averageReviewRating.toString()
        : null,
    negativeReviewCount: computed.inputs.negativeReviewCount,
    reserveBalanceMinor: computed.inputs.reserveBalanceMinor,
    reserveCurrency: computed.inputs.reserveCurrency,
    healthScore: computed.outcome.score.toString(),
    healthStatus: computed.outcome.status,
    generatedAt: new Date(),
    updatedAt: new Date(),
  } satisfies NewVillaHealthSnapshot;

  if (existing) {
    await db
      .update(villaHealthSnapshots)
      .set(values)
      .where(eq(villaHealthSnapshots.id, existing.id));
    const [row] = await db
      .select()
      .from(villaHealthSnapshots)
      .where(eq(villaHealthSnapshots.id, existing.id))
      .limit(1);
    return row ?? null;
  }
  const [row] = await db
    .insert(villaHealthSnapshots)
    .values(values)
    .returning();
  return row ?? null;
}

export async function listOwnerVillaHealthSnapshots(opts?: {
  ownerId?: string;
  villaId?: string;
}): Promise<VillaHealthSnapshot[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.villaId) filters.push(eq(villaHealthSnapshots.villaId, opts.villaId));
  if (opts?.ownerId) {
    const villaIds = (
      await db
        .select({ villaId: ownershipShares.villaId })
        .from(ownershipShares)
        .where(
          and(
            eq(ownershipShares.ownerId, opts.ownerId),
            eq(ownershipShares.status, "active"),
          ),
        )
    )
      .map((r) => r.villaId)
      .filter((v): v is string => Boolean(v));
    if (villaIds.length === 0) return [];
    filters.push(inArray(villaHealthSnapshots.villaId, villaIds));
  }
  const rows = await db
    .select()
    .from(villaHealthSnapshots)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(villaHealthSnapshots.generatedAt))
    .limit(200);
  return rows;
}

export async function getOwnerVillaHealth(
  villaId: string,
  periodStart: string,
  periodEnd: string,
): Promise<VillaHealthSnapshot | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(villaHealthSnapshots)
    .where(
      and(
        eq(villaHealthSnapshots.villaId, villaId),
        eq(villaHealthSnapshots.periodStart, periodStart),
        eq(villaHealthSnapshots.periodEnd, periodEnd),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getUpcomingPreventiveMaintenanceForOwner(
  villaId: string,
  horizonDays = 60,
): Promise<
  Array<{
    id: string;
    label: string;
    nextDueOn: string;
    cadence: string;
  }>
> {
  const db = getDb();
  if (!db) return [];
  const today = new Date();
  const horizon = new Date(today.getTime() + horizonDays * MS_PER_DAY);
  const rows = await db
    .select({
      id: preventiveSchedules.id,
      title: preventiveSchedules.name,
      nextDueOn: preventiveSchedules.nextDueOn,
      cadence: preventiveSchedules.frequency,
    })
    .from(preventiveSchedules)
    .where(
      and(
        eq(preventiveSchedules.villaId, villaId),
        sql`${preventiveSchedules.nextDueOn} is not null`,
        lte(
          preventiveSchedules.nextDueOn,
          formatDate(horizon),
        ),
        eq(preventiveSchedules.status, "active"),
      ),
    )
    .orderBy(asc(preventiveSchedules.nextDueOn))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    label: r.title ?? "Preventive maintenance",
    nextDueOn: (r.nextDueOn as unknown as string) ?? "",
    cadence: r.cadence ?? "—",
  }));
}

export async function getVillaOperationalTimeline(
  villaId: string,
  from: string,
  to: string,
): Promise<
  Array<{
    id: string;
    eventDate: string;
    title: string;
    severity: "info" | "success" | "warning" | "critical";
    sourceType: string;
  }>
> {
  const db = getDb();
  if (!db) return [];
  const taskRows = await db
    .select({
      id: operationTasks.id,
      title: operationTasks.title,
      category: operationTasks.category,
      status: operationTasks.status,
      scheduledFor: operationTasks.scheduledFor,
    })
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.villaId, villaId),
        gte(operationTasks.scheduledFor, from),
        lte(operationTasks.scheduledFor, to),
      ),
    )
    .orderBy(asc(operationTasks.scheduledFor))
    .limit(200);
  return taskRows
    .filter((t) => t.scheduledFor !== null)
    .map((t) => ({
      id: t.id,
      eventDate: (t.scheduledFor as unknown as string) ?? "",
      title: t.title ?? "Operations task",
      severity:
        ["completed", "done", "verified"].includes(
          (t.status ?? "").toLowerCase(),
        )
          ? ("success" as const)
          : ("info" as const),
      sourceType: (t.category ?? "task").toLowerCase().includes("maintenance")
        ? "maintenance_ticket"
        : "housekeeping_task",
    }));
}

// Utility helpers.

function toDateOnly(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") {
    return d.length >= 10 ? d.slice(0, 10) : d;
  }
  return formatDate(d);
}

function formatDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "1970-01-01";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Re-exported for ergonomics.
export { listOwnerIdsForCurrentUser };
export type { VillaHealthStatus, HealthOutcome };
