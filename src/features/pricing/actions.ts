"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  ratePlans,
  ratePlanSeasons,
  ratePlanOverrides,
} from "@/lib/db/schema/pricing";
import { projects, villas } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  createRatePlanSchema,
  createSeasonSchema,
  updateRatePlanSchema,
  upsertOverrideSchema,
} from "./schema";
import type { ActionResult } from "@/features/projects/actions";

function parseFormFields(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    ...raw,
    projectId: raw.projectId || null,
    villaId: raw.villaId || null,
    baseNightlyRateMinor: raw.baseNightlyRateMinor
      ? Number(raw.baseNightlyRateMinor)
      : 0,
    managementFeePercent: raw.managementFeePercent
      ? Number(raw.managementFeePercent)
      : null,
  };
}

export async function createRatePlanAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { ratePlanId?: string }> {
  await requirePermission("pricing.write");
  const parsed = createRatePlanSchema.safeParse(parseFormFields(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  // TENANCY: validate any supplied parent (project / villa-via-project) belongs
  // to the caller's org, then stamp the verified caller org on the new plan so a
  // crafted projectId/villaId can't anchor pricing to another org's tree.
  if (parsed.data.projectId) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, parsed.data.projectId),
          eq(projects.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!p) return { ok: false, error: "Invalid project." };
  }
  if (parsed.data.villaId) {
    const [v] = await db
      .select({ id: villas.id })
      .from(villas)
      .innerJoin(projects, eq(villas.projectId, projects.id))
      .where(
        and(
          eq(villas.id, parsed.data.villaId),
          eq(projects.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!v) return { ok: false, error: "Invalid villa." };
  }

  const [row] = await db
    .insert(ratePlans)
    .values({
      organizationId,
      name: parsed.data.name,
      projectId: parsed.data.projectId ?? null,
      villaId: parsed.data.villaId ?? null,
      baseCurrency: parsed.data.baseCurrency,
      baseNightlyRateMinor: parsed.data.baseNightlyRateMinor,
      managementFeePercent:
        parsed.data.managementFeePercent != null
          ? String(parsed.data.managementFeePercent)
          : null,
      createdBy: me?.id ?? null,
    })
    .returning({ id: ratePlans.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "pricing.rate_plan.create",
    entityType: "rate_plan",
    entityId: row!.id,
    after: {
      name: parsed.data.name,
      villaId: parsed.data.villaId ?? null,
      baseCurrency: parsed.data.baseCurrency,
    },
  });

  revalidatePath("/dashboard/bookings/rates");
  return { ok: true, ratePlanId: row!.id };
}

export async function updateRatePlanAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("pricing.write");
  const parsed = updateRatePlanSchema.safeParse({
    ...parseFormFields(formData),
    id: formData.get("id"),
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  // TENANCY: rate_plans.organization_id is the org anchor (pricing.ts:29).
  // Scope the update to the caller's org and confirm a row was hit so a
  // crafted id can't mutate another org's nightly pricing.
  const updated = await db
    .update(ratePlans)
    .set({
      name: parsed.data.name,
      projectId: parsed.data.projectId ?? null,
      villaId: parsed.data.villaId ?? null,
      baseCurrency: parsed.data.baseCurrency,
      baseNightlyRateMinor: parsed.data.baseNightlyRateMinor,
      managementFeePercent:
        parsed.data.managementFeePercent != null
          ? String(parsed.data.managementFeePercent)
          : null,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ratePlans.id, parsed.data.id),
        eq(ratePlans.organizationId, organizationId),
      ),
    )
    .returning({ id: ratePlans.id });
  if (!updated[0]) return { ok: false, error: "Rate plan not found." };

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "pricing.rate_plan.update",
    entityType: "rate_plan",
    entityId: parsed.data.id,
    after: { name: parsed.data.name },
  });
  revalidatePath("/dashboard/bookings/rates");
  revalidatePath(`/dashboard/bookings/rates/${parsed.data.id}`);
  return { ok: true };
}

export async function createRatePlanSeasonAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { seasonId?: string }> {
  await requirePermission("pricing.write");
  const raw = Object.fromEntries(formData.entries());
  const parsed = createSeasonSchema.safeParse({
    ratePlanId: raw.ratePlanId,
    name: raw.name,
    startsOn: raw.startsOn,
    endsOn: raw.endsOn,
    multiplier: raw.multiplier ? Number(raw.multiplier) : 1,
    nightlyRateMinor: raw.nightlyRateMinor ? Number(raw.nightlyRateMinor) : null,
    minLos: raw.minLos ? Number(raw.minLos) : null,
    maxLos: raw.maxLos ? Number(raw.maxLos) : null,
    stopSell: raw.stopSell === "on" || raw.stopSell === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  // TENANCY: verify the parent plan is in the caller's org before inserting,
  // and anchor the season's org, so a crafted ratePlanId can't attach a season
  // to another org's plan.
  const organizationId = await requireOrgId();
  const [parentPlan] = await db
    .select({ id: ratePlans.id })
    .from(ratePlans)
    .where(
      and(
        eq(ratePlans.id, parsed.data.ratePlanId),
        eq(ratePlans.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!parentPlan) return { ok: false, error: "Rate plan not found." };

  const [row] = await db
    .insert(ratePlanSeasons)
    .values({
      organizationId,
      ratePlanId: parsed.data.ratePlanId,
      name: parsed.data.name,
      startsOn: parsed.data.startsOn,
      endsOn: parsed.data.endsOn,
      multiplier: String(parsed.data.multiplier),
      nightlyRateMinor: parsed.data.nightlyRateMinor ?? null,
      minLos: parsed.data.minLos ?? null,
      maxLos: parsed.data.maxLos ?? null,
      stopSell: parsed.data.stopSell ?? false,
    })
    .returning({ id: ratePlanSeasons.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "pricing.season.create",
    entityType: "rate_plan_season",
    entityId: row!.id,
    after: parsed.data,
  });

  revalidatePath(`/dashboard/bookings/rates/${parsed.data.ratePlanId}`);
  revalidatePath(`/dashboard/bookings/rates/${parsed.data.ratePlanId}/seasons`);
  return { ok: true, seasonId: row!.id };
}

export async function upsertRatePlanOverrideAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("pricing.write");
  const raw = Object.fromEntries(formData.entries());
  const parsed = upsertOverrideSchema.safeParse({
    ratePlanId: raw.ratePlanId,
    stayDate: raw.stayDate,
    nightlyRateMinor: raw.nightlyRateMinor ? Number(raw.nightlyRateMinor) : null,
    minLos: raw.minLos ? Number(raw.minLos) : null,
    stopSell: raw.stopSell === "on" || raw.stopSell === "true",
    source: raw.source || "manual",
    notes: raw.notes || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY: rate plans/overrides are org-scoped (rate_plans_org_idx). Verify
  // the parent plan is in the caller's org and stamp the override's org, so a
  // crafted ratePlanId can't move another org's nightly pricing.
  const organizationId = await requireOrgId();
  const [plan] = await db
    .select({ id: ratePlans.id })
    .from(ratePlans)
    .where(and(eq(ratePlans.id, parsed.data.ratePlanId), eq(ratePlans.organizationId, organizationId)))
    .limit(1);
  if (!plan) return { ok: false, error: "Rate plan not found." };

  await db
    .insert(ratePlanOverrides)
    .values({
      organizationId,
      ratePlanId: parsed.data.ratePlanId,
      stayDate: parsed.data.stayDate,
      nightlyRateMinor: parsed.data.nightlyRateMinor ?? null,
      minLos: parsed.data.minLos ?? null,
      stopSell: parsed.data.stopSell ?? false,
      source: parsed.data.source,
      notes: parsed.data.notes ?? null,
      createdBy: me?.id ?? null,
    })
    .onConflictDoUpdate({
      target: [ratePlanOverrides.ratePlanId, ratePlanOverrides.stayDate],
      set: {
        nightlyRateMinor: parsed.data.nightlyRateMinor ?? null,
        minLos: parsed.data.minLos ?? null,
        stopSell: parsed.data.stopSell ?? false,
        source: parsed.data.source,
        notes: parsed.data.notes ?? null,
        createdBy: me?.id ?? null,
      },
    });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "pricing.override.upsert",
    entityType: "rate_plan_override",
    entityId: parsed.data.ratePlanId,
    after: parsed.data,
  });

  revalidatePath(`/dashboard/bookings/rates/${parsed.data.ratePlanId}`);
  revalidatePath(`/dashboard/bookings/rates/${parsed.data.ratePlanId}/overrides`);
  return { ok: true };
}
