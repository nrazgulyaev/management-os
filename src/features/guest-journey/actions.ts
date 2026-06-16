"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestJourneyRules,
  guestJourneySuggestions,
  guestJourneyEvents,
} from "@/lib/db/schema/guest-journey";
import { ownerCalendarPreferences } from "@/lib/db/schema/owner-intelligence";
import { owners, ownershipShares } from "@/lib/db/schema/ownership";
import { villas, projects } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { listOwnerIdsForCurrentUser } from "@/features/notifications/services";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  createGuestJourneyRuleSchema,
  generateSuggestionsSchema,
  journeyRuleIdSchema,
  ownerCalendarPreferencesUpdateSchema,
  rebuildOwnerEventsSchema,
  runJourneyRuleSchema,
  suggestionIdSchema,
  updateRuleStatusSchema,
} from "./schema";
import {
  createReviewRequestForBooking,
  ensureJourneyRunsForBooking,
  generateJourneySuggestionsForBooking as runnerGenerate,
  runDueGuestJourneyRules,
  runGuestJourneyRuleForBooking,
  runPostStayReviewRequests,
} from "./runner";
import {
  rebuildOwnerVisibleEventsForOwner,
  rebuildOwnerVisibleEventsForVilla,
} from "./owner-events-rebuild";
import type { ActionResult } from "@/features/projects/actions";

export async function createGuestJourneyRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requirePermission("guest_journey.write");
  const parsed = createGuestJourneyRuleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const v = parsed.data;
  const [row] = await db
    .insert(guestJourneyRules)
    .values({
      organizationId,
      ruleKey: v.ruleKey,
      name: v.name,
      description: v.description ?? null,
      journeyStage: v.journeyStage,
      triggerAnchor: v.triggerAnchor,
      offsetMinutes: v.offsetMinutes,
      channel: v.channel,
      templateKey: v.templateKey ?? null,
      suggestionType: v.suggestionType ?? null,
      serviceId: v.serviceId ?? null,
      villaId: v.villaId ?? null,
      projectId: v.projectId ?? null,
      appliesToChannel: v.appliesToChannel ?? null,
      priority: v.priority,
      status: "active",
      createdBy: me?.id ?? null,
    })
    .returning({ id: guestJourneyRules.id });
  if (!row) return { ok: false, error: "Insert failed." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_journey.rule.create",
    entityType: "guest_journey_rule",
    entityId: row.id,
    after: { ruleKey: v.ruleKey, journeyStage: v.journeyStage },
  });
  revalidatePath("/dashboard/guest-journey/rules");
  return { ok: true, id: row.id };
}

async function setRuleStatus(
  id: string,
  status: "active" | "paused" | "archived",
  permission: string,
): Promise<ActionResult> {
  await requirePermission(permission);
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  // Tenancy guard: guest_journey_rules.organization_id is NOT NULL (0152/0158).
  // Confirm the rule belongs to the caller's org before flipping its status; a
  // cross-org id reads as not-found.
  const [owned] = await db
    .select({ id: guestJourneyRules.id })
    .from(guestJourneyRules)
    .where(
      and(
        eq(guestJourneyRules.id, id),
        eq(guestJourneyRules.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: "Rule not found." };
  await db
    .update(guestJourneyRules)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(guestJourneyRules.id, id),
        eq(guestJourneyRules.organizationId, organizationId),
      ),
    );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `guest_journey.rule.${status}`,
    entityType: "guest_journey_rule",
    entityId: id,
  });
  revalidatePath("/dashboard/guest-journey/rules");
  revalidatePath(`/dashboard/guest-journey/rules/${id}`);
  return { ok: true };
}

export async function pauseGuestJourneyRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = journeyRuleIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setRuleStatus(parsed.data.id, "paused", "guest_journey.write");
}

export async function resumeGuestJourneyRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = journeyRuleIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setRuleStatus(parsed.data.id, "active", "guest_journey.write");
}

export async function archiveGuestJourneyRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateRuleStatusSchema.safeParse({
    id: formData.get("id"),
    status: "archived",
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setRuleStatus(parsed.data.id, "archived", "guest_journey.manage");
}

/**
 * TENANCY: confirm a client-supplied bookingId belongs to the caller's org
 * before any journey dispatch. bookings.organization_id is NOT NULL (0155); a
 * foreign bookingId resolves to false → "not found".
 */
async function bookingBelongsToCurrentOrg(
  bookingId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const organizationId = await requireOrgId();
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.organizationId, organizationId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function runJourneyRuleNowAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { runStatus?: string }> {
  await requirePermission("guest_journey.run");
  const parsed = runJourneyRuleSchema.safeParse({
    bookingId: formData.get("bookingId"),
    ruleId: formData.get("ruleId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!(await bookingBelongsToCurrentOrg(parsed.data.bookingId))) {
    return { ok: false, error: "Booking not found." };
  }
  await ensureJourneyRunsForBooking(parsed.data.bookingId);
  const out = await runGuestJourneyRuleForBooking(
    parsed.data.bookingId,
    parsed.data.ruleId,
  );
  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_journey.rule.run_now",
    entityType: "guest_journey_run",
    entityId: null,
    after: {
      bookingId: parsed.data.bookingId,
      ruleId: parsed.data.ruleId,
      status: out?.status,
    },
  });
  revalidatePath("/dashboard/guest-journey/runs");
  return { ok: true, runStatus: out?.status };
}

export async function generateJourneySuggestionsForBookingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { created?: number }> {
  await requirePermission("guest_journey.run");
  const parsed = generateSuggestionsSchema.safeParse({
    bookingId: formData.get("bookingId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!(await bookingBelongsToCurrentOrg(parsed.data.bookingId))) {
    return { ok: false, error: "Booking not found." };
  }
  const out = await runnerGenerate(parsed.data.bookingId);
  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_journey.suggestions.generate",
    entityType: "booking",
    entityId: parsed.data.bookingId,
    after: { created: out.created },
  });
  revalidatePath("/dashboard/guest-journey/suggestions");
  return { ok: true, created: out.created };
}

export async function dismissGuestJourneySuggestionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Guest-action — no permission check; the stay-token gate happens
  // on the page that calls this. The dedupe key in the suggestion id
  // makes this safe for repeated dismiss clicks.
  const parsed = suggestionIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  await db
    .update(guestJourneySuggestions)
    .set({
      status: "dismissed",
      dismissedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(guestJourneySuggestions.id, parsed.data.id));
  // Append a journey event so the timeline reflects the click.
  const [s] = await db
    .select()
    .from(guestJourneySuggestions)
    .where(eq(guestJourneySuggestions.id, parsed.data.id))
    .limit(1);
  if (s?.bookingId) {
    await db.insert(guestJourneyEvents).values({
      bookingId: s.bookingId,
      stayTokenId: s.stayTokenId ?? null,
      eventType: "service_clicked",
      sourceType: "guest_action",
      sourceId: s.id,
      title: `Dismissed: ${s.title}`,
      description: null,
      severity: "info",
      ownerVisible: false,
    });
  }
  return { ok: true };
}

export async function clickGuestJourneySuggestionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = suggestionIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  await db
    .update(guestJourneySuggestions)
    .set({
      status: "clicked",
      clickedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(guestJourneySuggestions.id, parsed.data.id));
  const [s] = await db
    .select()
    .from(guestJourneySuggestions)
    .where(eq(guestJourneySuggestions.id, parsed.data.id))
    .limit(1);
  if (s?.bookingId) {
    await db.insert(guestJourneyEvents).values({
      bookingId: s.bookingId,
      stayTokenId: s.stayTokenId ?? null,
      eventType: "service_clicked",
      sourceType: "guest_action",
      sourceId: s.id,
      title: s.title,
      description: null,
      severity: "info",
      ownerVisible: false,
    });
  }
  return { ok: true };
}

export async function runDueJourneyRulesAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult & { executed?: number; skipped?: number; failed?: number }> {
  await requirePermission("guest_journey.run");
  const out = await runDueGuestJourneyRules(100);
  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_journey.due.run",
    entityType: "guest_journey_run",
    entityId: null,
    after: out,
  });
  revalidatePath("/dashboard/guest-journey");
  revalidatePath("/dashboard/guest-journey/runs");
  return { ok: true, ...out };
}

export async function runReviewRequestsAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult & { created?: number; skipped?: number }> {
  await requirePermission("review_request.write");
  const out = await runPostStayReviewRequests(100);
  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "review_request.run",
    entityType: "guest_review_request",
    entityId: null,
    after: out,
  });
  revalidatePath("/dashboard/guest-journey/reviews");
  return { ok: true, ...out };
}

export async function refreshOwnerVisibleEventsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<
  ActionResult & {
    inserted?: number;
    ownersTouched?: number;
    ownersProcessed?: number;
  }
> {
  await requirePermission("owner_calendar.manage");
  const parsed = rebuildOwnerEventsSchema.safeParse({
    ownerId: formData.get("ownerId") || undefined,
    villaId: formData.get("villaId") || undefined,
    from: formData.get("from"),
    to: formData.get("to"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const me = await getCurrentAppUser();
  const v = parsed.data;
  const organizationId = await requireOrgId();
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  if (v.ownerId) {
    // TENANCY: the ownerId is client-supplied. owners.organization_id is the
    // only org anchor an owner has (no project/villa FK) — confirm it belongs
    // to the caller's org before rebuilding that owner's projection, else a
    // foreign ownerId would rebuild (and leak via owner_visible_events) the
    // real villas of another tenant's owner.
    const [ownedOwner] = await db
      .select({ id: owners.id })
      .from(owners)
      .where(
        and(
          eq(owners.id, v.ownerId),
          eq(owners.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!ownedOwner) return { ok: false, error: "Owner not found." };
    const out = await rebuildOwnerVisibleEventsForOwner(
      v.ownerId,
      v.from,
      v.to,
      organizationId,
    );
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "owner_visible_events.rebuild.owner",
      entityType: "owner",
      entityId: v.ownerId,
      after: { from: v.from, to: v.to, inserted: out.inserted },
    });
    revalidatePath("/dashboard/owner-intelligence");
    revalidatePath("/dashboard/owner-intelligence/rebuild");
    return { ok: true, inserted: out.inserted };
  }
  if (v.villaId) {
    // TENANCY: the villaId is client-supplied. Villas anchor org via their
    // project — confirm villa → project.organization_id matches the caller's
    // org before rebuilding the events of that villa's owners.
    const [ownedVilla] = await db
      .select({ id: villas.id })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(
        and(
          eq(villas.id, v.villaId),
          eq(projects.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!ownedVilla) return { ok: false, error: "Villa not found." };
    const out = await rebuildOwnerVisibleEventsForVilla(
      v.villaId,
      v.from,
      v.to,
      organizationId,
    );
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "owner_visible_events.rebuild.villa",
      entityType: "villa",
      entityId: v.villaId,
      after: { from: v.from, to: v.to, ...out },
    });
    revalidatePath("/dashboard/owner-intelligence");
    return {
      ok: true,
      inserted: out.insertedByOwner,
      ownersTouched: out.ownersTouched,
    };
  }
  // TENANCY (write-flow IDOR): the prior fall-through (neither ownerId nor
  // villaId supplied) called rebuildOwnerVisibleEventsForAllOwners(from,to)
  // with NO org boundary, so one tenant's button rebuilt EVERY tenant's
  // owner-visible events. Scope the sweep to the caller's org: resolve only
  // this org's active owners and rebuild per-owner, threading the verified org
  // so each owner's shares stay constrained and events are stamped correctly.
  const ownerRows = await db
    .selectDistinct({ ownerId: ownershipShares.ownerId })
    .from(ownershipShares)
    .where(
      and(
        eq(ownershipShares.status, "active"),
        eq(ownershipShares.organizationId, organizationId),
      ),
    );
  let insertedAll = 0;
  for (const o of ownerRows) {
    const r = await rebuildOwnerVisibleEventsForOwner(
      o.ownerId,
      v.from,
      v.to,
      organizationId,
    );
    insertedAll += r.inserted;
  }
  const out = {
    ownersProcessed: ownerRows.length,
    inserted: insertedAll,
  };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_visible_events.rebuild.all",
    entityType: "owner_visible_event",
    entityId: null,
    after: { from: v.from, to: v.to, ...out },
  });
  revalidatePath("/dashboard/owner-intelligence");
  return {
    ok: true,
    inserted: out.inserted,
    ownersProcessed: out.ownersProcessed,
  };
}

/**
 * Owner-side preferences mutator. Scoped to the current owner via
 * `listOwnerIdsForCurrentUser`. An admin user with the right
 * permission can edit any owner row; an owner-side user can only
 * edit their own preferences.
 */
export async function updateOwnerCalendarPreferencesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = ownerCalendarPreferencesUpdateSchema.safeParse({
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
  const v = parsed.data;
  const me = await getCurrentAppUser();
  // Ownership scope check — the user must either have the admin
  // `owner_calendar.manage` permission OR be a grantee of the owner
  // they're editing.
  const myOwnerIds = await listOwnerIdsForCurrentUser();
  if (!myOwnerIds.includes(v.ownerId)) {
    await requirePermission("owner_calendar.manage");
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  // TENANCY (write-flow IDOR): the admin path lets a manage-permission holder
  // edit ANY ownerId; without an org filter that selects/overwrites another
  // tenant's preferences row by id. Resolve the caller org and confirm the
  // owner belongs to it BEFORE touching the row. owners.organizationId is a
  // nullable backfill anchor (migration 0173) so we fail open on NULL but
  // reject a confirmed foreign org. The verified org then scopes the
  // existing-row lookup/UPDATE and is stamped on INSERT.
  const organizationId = await requireOrgId();
  const [owner] = await db
    .select({ id: owners.id })
    .from(owners)
    .where(
      and(
        eq(owners.id, v.ownerId),
        or(
          isNull(owners.organizationId),
          eq(owners.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  if (!owner) return { ok: false, error: "Owner not found." };

  const [existing] = await db
    .select()
    .from(ownerCalendarPreferences)
    .where(
      and(
        eq(ownerCalendarPreferences.ownerId, v.ownerId),
        or(
          isNull(ownerCalendarPreferences.organizationId),
          eq(ownerCalendarPreferences.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  const values = {
    ownerId: v.ownerId,
    organizationId,
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
      .where(
        and(
          eq(ownerCalendarPreferences.id, existing.id),
          or(
            isNull(ownerCalendarPreferences.organizationId),
            eq(ownerCalendarPreferences.organizationId, organizationId),
          ),
        ),
      );
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
  revalidatePath("/owner/preferences/calendar");
  revalidatePath("/dashboard/owner-intelligence/preferences");
  return { ok: true };
}

/**
 * Convenience wrapper for the post-stay review request job — used
 * by the cron route to drive `runPostStayReviewRequests`.
 */
export async function createReviewRequestsForRecentCheckouts(): Promise<{
  created: number;
  skipped: number;
}> {
  return runPostStayReviewRequests(100);
}

// Re-exporting so the cron handler can call without importing the
// full runner.
export { createReviewRequestForBooking };
