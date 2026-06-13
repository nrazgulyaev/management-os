"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestReviews,
  ownerCalendarPreferences,
  villaHealthSnapshots,
} from "@/lib/db/schema/owner-intelligence";
import { villas, projects } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  createManualGuestReviewSchema,
  generateAllSnapshotsSchema,
  generateVillaHealthSnapshotSchema,
  reviewIdSchema,
  updateOwnerCalendarPreferencesSchema,
} from "./schema";
import {
  generateVillaHealthSnapshot,
} from "./health-services";
import type { ActionResult } from "@/features/projects/actions";

export async function updateOwnerCalendarPreferencesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_calendar.read");
  const parsed = updateOwnerCalendarPreferencesSchema.safeParse({
    ownerId: formData.get("ownerId"),
    defaultCurrency: formData.get("defaultCurrency") || undefined,
    showGuestNames: formData.get("showGuestNames") || undefined,
    showGuestCountry: formData.get("showGuestCountry") || undefined,
    showChannelLabels: formData.get("showChannelLabels") || undefined,
    showMaintenanceDetails:
      formData.get("showMaintenanceDetails") || undefined,
    calendarDensity: formData.get("calendarDensity") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const v = parsed.data;

  const [existing] = await db
    .select()
    .from(ownerCalendarPreferences)
    .where(eq(ownerCalendarPreferences.ownerId, v.ownerId))
    .limit(1);

  const values = {
    ownerId: v.ownerId,
    defaultCurrency: v.defaultCurrency ?? "USD",
    showGuestNames: v.showGuestNames ?? true,
    showGuestCountry: v.showGuestCountry ?? true,
    showChannelLabels: v.showChannelLabels ?? true,
    showMaintenanceDetails: v.showMaintenanceDetails ?? true,
    calendarDensity: v.calendarDensity ?? "comfortable",
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(ownerCalendarPreferences)
      .set(values)
      .where(eq(ownerCalendarPreferences.id, existing.id));
  } else {
    await db.insert(ownerCalendarPreferences).values(values);
  }
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_calendar.preferences.update",
    entityType: "owner_calendar_preference",
    entityId: existing?.id ?? null,
    after: values as unknown as Record<string, unknown>,
  });
  revalidatePath("/owner");
  revalidatePath("/owner/calendar");
  revalidatePath("/dashboard/owner-intelligence/preferences");
  return { ok: true };
}

export async function generateVillaHealthSnapshotAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { snapshotId?: string }> {
  await requirePermission("villa_health.generate");
  const parsed = generateVillaHealthSnapshotSchema.safeParse({
    villaId: formData.get("villaId"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const me = await getCurrentAppUser();
  // TENANCY (write-flow IDOR): pass the verified caller org so a cross-org
  // villaId is rejected inside computeVillaHealth and the snapshot is stamped.
  const organizationId = await requireOrgId();
  const row = await generateVillaHealthSnapshot(
    parsed.data.villaId,
    parsed.data.periodStart,
    parsed.data.periodEnd,
    organizationId,
  );
  if (!row) {
    return { ok: false, error: "Couldn't generate snapshot." };
  }
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "villa_health.snapshot.generate",
    entityType: "villa_health_snapshot",
    entityId: row.id,
    after: {
      villaId: parsed.data.villaId,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      score: row.healthScore,
      status: row.healthStatus,
    },
  });
  revalidatePath("/dashboard/owner-intelligence/health");
  revalidatePath(`/dashboard/owner-intelligence/health/${parsed.data.villaId}`);
  revalidatePath(`/owner/villas/${parsed.data.villaId}/health`);
  return { ok: true, snapshotId: row.id };
}

export async function generateAllOwnerHealthSnapshotsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { generated?: number }> {
  await requirePermission("villa_health.generate");
  const parsed = generateAllSnapshotsSchema.safeParse({
    month: formData.get("month") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const month = parsed.data.month ?? currentMonth();
  const [year, mon] = month.split("-").map(Number);
  const start = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const end = `${year}-${String(mon).padStart(2, "0")}-${String(
    lastDay,
  ).padStart(2, "0")}`;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  // TENANCY (write-flow IDOR): only sweep villas in the caller's org. The
  // prior version generated snapshots for EVERY tenant's villas. Snapshots
  // have a nullable org anchor, so the prior-snapshot sweep includes NULL
  // (pre-threading) rows but excludes those anchored to a different org; the
  // canonical org membership for a villa is its project, joined below.
  const organizationId = await requireOrgId();
  const allVillas = (
    await db
      .select({ id: villaHealthSnapshots.villaId })
      .from(villaHealthSnapshots)
      .innerJoin(villas, eq(villas.id, villaHealthSnapshots.villaId))
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(projects.organizationId, organizationId))
      .groupBy(villaHealthSnapshots.villaId)
  ).map((r) => r.id);

  // Fall back to listing real villas (scoped to the org via their project)
  // when there are no prior snapshots.
  let target = allVillas;
  if (target.length === 0) {
    const rows = await db
      .select({ id: villas.id })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(projects.organizationId, organizationId));
    target = rows.map((r) => r.id);
  }
  let generated = 0;
  for (const villaId of target) {
    const out = await generateVillaHealthSnapshot(
      villaId,
      start,
      end,
      organizationId,
    );
    if (out) generated++;
  }
  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "villa_health.snapshot.bulk_generate",
    entityType: "villa_health_snapshot",
    entityId: null,
    after: { month, generated },
  });
  revalidatePath("/dashboard/owner-intelligence/health");
  revalidatePath("/dashboard/owner-intelligence");
  return { ok: true, generated };
}

export async function createManualGuestReviewAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requirePermission("guest_review.write");
  const raw = Object.fromEntries(formData.entries());
  const parsed = createManualGuestReviewSchema.safeParse({
    villaId: raw.villaId,
    bookingId: raw.bookingId || undefined,
    source: raw.source || undefined,
    reviewerDisplayName: raw.reviewerDisplayName || undefined,
    reviewerCountry: raw.reviewerCountry || undefined,
    rating: raw.rating || undefined,
    text: raw.text || undefined,
    reviewDate: raw.reviewDate || undefined,
    ownerVisible: raw.ownerVisible ?? true,
    publicVisible: raw.publicVisible ?? false,
    status: raw.status || undefined,
    sentiment: raw.sentiment || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const v = parsed.data;
  // TENANCY (write-flow IDOR): the villa is org-anchored via its project.
  // Resolve the caller org and confirm the villa belongs to it BEFORE the
  // insert; a foreign villaId reads as "not found". Stamp the VERIFIED caller
  // org on the new review (do not trust any child-derived value).
  const organizationId = await requireOrgId();
  const [villa] = await db
    .select({ orgId: projects.organizationId })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        eq(villas.id, v.villaId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!villa) return { ok: false, error: "Villa not found." };
  const [row] = await db
    .insert(guestReviews)
    .values({
      organizationId,
      villaId: v.villaId,
      bookingId: v.bookingId ?? null,
      source: v.source,
      reviewerDisplayName: v.reviewerDisplayName ?? null,
      reviewerCountry: v.reviewerCountry ?? null,
      rating:
        v.rating !== undefined && v.rating !== null
          ? v.rating.toString()
          : null,
      text: v.text ?? null,
      reviewDate: v.reviewDate ?? null,
      ownerVisible: v.ownerVisible ?? true,
      publicVisible: v.publicVisible ?? false,
      status: v.status ?? "published",
      sentiment: v.sentiment ?? null,
    })
    .returning({ id: guestReviews.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_review.create",
    entityType: "guest_review",
    entityId: row!.id,
    after: { villaId: v.villaId, source: v.source, rating: v.rating },
  });
  revalidatePath("/dashboard/owner-intelligence/reviews");
  revalidatePath(`/owner/villas/${v.villaId}/health`);
  return { ok: true, id: row!.id };
}

export async function hideGuestReviewAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("guest_review.manage");
  const parsed = reviewIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY (write-flow IDOR): guest_reviews.organizationId is a nullable
  // backfill column (migration 0154, not threaded yet). AND a legacy-safe org
  // predicate into the UPDATE — NULL (pre-threading) rows stay mutable, a row
  // anchored to a different tenant is rejected — and fail closed on zero rows
  // so a foreign id cannot silently no-op as success.
  const orgId = await requireOrgId();
  const hidden = await db
    .update(guestReviews)
    .set({
      ownerVisible: false,
      status: "hidden",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(guestReviews.id, parsed.data.id),
        or(
          isNull(guestReviews.organizationId),
          eq(guestReviews.organizationId, orgId),
        ),
      ),
    )
    .returning({ id: guestReviews.id });
  if (hidden.length === 0) return { ok: false, error: "Review not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_review.hide",
    entityType: "guest_review",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/owner-intelligence/reviews");
  return { ok: true };
}

export async function markGuestReviewOwnerVisibleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("guest_review.manage");
  const parsed = reviewIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY (write-flow IDOR): same legacy-safe org scoping as
  // hideGuestReviewAction — guest_reviews.organizationId is nullable.
  const orgId = await requireOrgId();
  const published = await db
    .update(guestReviews)
    .set({
      ownerVisible: true,
      status: "published",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(guestReviews.id, parsed.data.id),
        or(
          isNull(guestReviews.organizationId),
          eq(guestReviews.organizationId, orgId),
        ),
      ),
    )
    .returning({ id: guestReviews.id });
  if (published.length === 0) return { ok: false, error: "Review not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_review.publish",
    entityType: "guest_review",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/owner-intelligence/reviews");
  return { ok: true };
}

export async function refreshOwnerVisibleEventsAction(
  _prev?: ActionResult | null,
  _formData?: FormData,
): Promise<ActionResult & { inserted?: number; ownersProcessed?: number }> {
  await requirePermission("owner_calendar.manage");
  const { rebuildOwnerVisibleEventsForAllOwners } = await import(
    "@/features/guest-journey/owner-events-rebuild"
  );
  // Default window: -90d .. +120d around today.
  const today = new Date();
  const fromDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  const toDate = new Date(today.getTime() + 120 * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);
  const out = await rebuildOwnerVisibleEventsForAllOwners(from, to);
  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_calendar.events.refresh",
    entityType: "owner_visible_event",
    entityId: null,
    after: { from, to, ...out },
  });
  revalidatePath("/dashboard/owner-intelligence");
  return {
    ok: true,
    inserted: out.inserted,
    ownersProcessed: out.ownersProcessed,
  };
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
