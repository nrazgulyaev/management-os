"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  pricingChannelRules,
  pricingCloseOutRules,
  pricingDayOfWeekRules,
  pricingMinStayRules,
  pricingOccupancyRules,
  pricingRuleSets,
  pricingStopSellRules,
  villaRateOverrides,
} from "@/lib/db/schema/dynamic-pricing";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { projects, villas } from "@/lib/db/schema/projects";
import {
  adminQuoteStaySchema,
  archivePricingRuleSchema,
  createMinStayRuleSchema,
  createPricingRuleSetSchema,
  createStopSellRuleSchema,
  ruleSetIdSchema,
  simulateChannelPushSchema,
  updatePricingRuleSetSchema,
  upsertChannelRuleSchema,
  upsertCloseOutRuleSchema,
  upsertDayOfWeekRuleSchema,
  upsertOccupancyRuleSchema,
} from "./schema";
import { quoteDynamicStay } from "./services";
import { simulateChannelPushForRatePlan } from "./channel-push-stub";
import type { ActionResult } from "@/features/projects/actions";

// =============================================================================
// RULE SETS
// =============================================================================

export async function createPricingRuleSetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requirePermission("dynamic_pricing.write");
  const parsed = createPricingRuleSetSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const v = parsed.data;

  // Validate any client-supplied project/villa FK belongs to the caller's org
  // before stamping it onto a tenant-anchored rule set (no cross-org scoping).
  if (v.projectId) {
    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, v.projectId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!proj) return { ok: false, error: "Project not found." };
  }
  if (v.villaId) {
    const [villa] = await db
      .select({ id: villas.id })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(and(eq(villas.id, v.villaId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!villa) return { ok: false, error: "Villa not found." };
  }

  const [row] = await db
    .insert(pricingRuleSets)
    .values({
      organizationId,
      ruleSetCode: v.ruleSetCode,
      name: v.name,
      scopeType: v.scopeType,
      projectId: v.projectId ?? null,
      villaId: v.villaId ?? null,
      priority: v.priority,
      currency: v.currency,
      baseRateMinor: BigInt(v.baseRateMinor),
      minRateMinor:
        v.minRateMinor != null ? BigInt(v.minRateMinor) : null,
      maxRateMinor:
        v.maxRateMinor != null ? BigInt(v.maxRateMinor) : null,
      createdBy: me?.id ?? null,
    })
    .returning({ id: pricingRuleSets.id });
  if (!row) return { ok: false, error: "Insert failed." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.rule_set.create",
    entityType: "pricing_rule_set",
    entityId: row.id,
    after: { ruleSetCode: v.ruleSetCode, scopeType: v.scopeType },
  });
  revalidatePath("/dashboard/pricing/rule-sets");
  return { ok: true, id: row.id };
}

export async function updatePricingRuleSetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  const parsed = updatePricingRuleSetSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const { id, ...v } = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (v.name != null) updates.name = v.name;
  if (v.priority != null) updates.priority = v.priority;
  if (v.currency != null) updates.currency = v.currency;
  if (v.baseRateMinor != null) updates.baseRateMinor = BigInt(v.baseRateMinor);
  if (v.minRateMinor != null) updates.minRateMinor = BigInt(v.minRateMinor);
  if (v.maxRateMinor != null) updates.maxRateMinor = BigInt(v.maxRateMinor);
  if (v.status != null) updates.status = v.status;
  await db
    .update(pricingRuleSets)
    .set(updates)
    .where(
      and(
        eq(pricingRuleSets.id, id),
        eq(pricingRuleSets.organizationId, organizationId),
      ),
    );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.rule_set.update",
    entityType: "pricing_rule_set",
    entityId: id,
    after: v as Record<string, unknown>,
  });
  revalidatePath(`/dashboard/pricing/rule-sets/${id}`);
  return { ok: true };
}

async function setRuleSetStatus(
  id: string,
  status: "active" | "paused" | "archived",
  permission: string,
): Promise<ActionResult> {
  await requirePermission(permission);
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  await db
    .update(pricingRuleSets)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(pricingRuleSets.id, id),
        eq(pricingRuleSets.organizationId, organizationId),
      ),
    );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `dynamic_pricing.rule_set.${status}`,
    entityType: "pricing_rule_set",
    entityId: id,
  });
  revalidatePath("/dashboard/pricing/rule-sets");
  revalidatePath(`/dashboard/pricing/rule-sets/${id}`);
  return { ok: true };
}

export async function pausePricingRuleSetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = ruleSetIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setRuleSetStatus(parsed.data.id, "paused", "dynamic_pricing.write");
}

export async function archivePricingRuleSetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = ruleSetIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setRuleSetStatus(
    parsed.data.id,
    "archived",
    "dynamic_pricing.manage",
  );
}

// =============================================================================
// RULES (upsert / create / archive)
// =============================================================================

/**
 * Guard: a client-supplied ruleSetId must belong to the caller's org before
 * any rule write hangs a child rule off it. pricing_rule_sets carries
 * organization_id (0153). Returns false for a cross-org / missing id.
 */
async function ruleSetInOrg(
  ruleSetId: string,
  organizationId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: pricingRuleSets.id })
    .from(pricingRuleSets)
    .where(
      and(
        eq(pricingRuleSets.id, ruleSetId),
        eq(pricingRuleSets.organizationId, organizationId),
      ),
    )
    .limit(1);
  return !!row;
}

export async function upsertDayOfWeekRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  const parsed = upsertDayOfWeekRuleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const v = parsed.data;
  if (!(await ruleSetInOrg(v.ruleSetId, organizationId))) {
    return { ok: false, error: "Rule set not found." };
  }
  const [existing] = await db
    .select()
    .from(pricingDayOfWeekRules)
    .where(
      and(
        eq(pricingDayOfWeekRules.ruleSetId, v.ruleSetId),
        eq(pricingDayOfWeekRules.organizationId, organizationId),
        eq(pricingDayOfWeekRules.weekday, v.weekday),
      ),
    )
    .limit(1);
  const values = {
    organizationId,
    ruleSetId: v.ruleSetId,
    weekday: v.weekday,
    modifierType: v.modifierType,
    modifierValueNumeric:
      v.modifierValueNumeric != null ? String(v.modifierValueNumeric) : null,
    modifierAmountMinor:
      v.modifierAmountMinor != null ? BigInt(v.modifierAmountMinor) : null,
    minLos: v.minLos ?? null,
    status: "active" as const,
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(pricingDayOfWeekRules)
      .set(values)
      .where(
        and(
          eq(pricingDayOfWeekRules.id, existing.id),
          eq(pricingDayOfWeekRules.organizationId, organizationId),
        ),
      );
  } else {
    await db.insert(pricingDayOfWeekRules).values(values);
  }
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.dow.upsert",
    entityType: "pricing_day_of_week_rule",
    entityId: existing?.id ?? null,
    after: { weekday: v.weekday, modifierType: v.modifierType },
  });
  revalidatePath(`/dashboard/pricing/rule-sets/${v.ruleSetId}`);
  return { ok: true };
}

export async function upsertOccupancyRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  const parsed = upsertOccupancyRuleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  if (parsed.data.occupancyMin >= parsed.data.occupancyMax) {
    return { ok: false, error: "occupancy_min must be < occupancy_max" };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const v = parsed.data;
  if (!(await ruleSetInOrg(v.ruleSetId, organizationId))) {
    return { ok: false, error: "Rule set not found." };
  }
  await db.insert(pricingOccupancyRules).values({
    organizationId,
    ruleSetId: v.ruleSetId,
    occupancyMin: String(v.occupancyMin),
    occupancyMax: String(v.occupancyMax),
    modifierType: v.modifierType,
    modifierValueNumeric:
      v.modifierValueNumeric != null ? String(v.modifierValueNumeric) : null,
    modifierAmountMinor:
      v.modifierAmountMinor != null ? BigInt(v.modifierAmountMinor) : null,
    status: "active",
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.occupancy.create",
    entityType: "pricing_occupancy_rule",
    entityId: null,
    after: { occupancyMin: v.occupancyMin, occupancyMax: v.occupancyMax },
  });
  revalidatePath(`/dashboard/pricing/rule-sets/${v.ruleSetId}`);
  return { ok: true };
}

export async function upsertCloseOutRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  const parsed = upsertCloseOutRuleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const v = parsed.data;
  if (!(await ruleSetInOrg(v.ruleSetId, organizationId))) {
    return { ok: false, error: "Rule set not found." };
  }
  await db.insert(pricingCloseOutRules).values({
    organizationId,
    ruleSetId: v.ruleSetId,
    daysBeforeCheckinMin: v.daysBeforeCheckinMin,
    daysBeforeCheckinMax: v.daysBeforeCheckinMax,
    modifierType: v.modifierType,
    modifierValueNumeric:
      v.modifierValueNumeric != null ? String(v.modifierValueNumeric) : null,
    modifierAmountMinor:
      v.modifierAmountMinor != null ? BigInt(v.modifierAmountMinor) : null,
    minLos: v.minLos ?? null,
    status: "active",
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.close_out.create",
    entityType: "pricing_close_out_rule",
    entityId: null,
    after: {
      daysBeforeCheckinMin: v.daysBeforeCheckinMin,
      daysBeforeCheckinMax: v.daysBeforeCheckinMax,
    },
  });
  revalidatePath(`/dashboard/pricing/rule-sets/${v.ruleSetId}`);
  return { ok: true };
}

export async function upsertChannelRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  const parsed = upsertChannelRuleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const v = parsed.data;
  if (!(await ruleSetInOrg(v.ruleSetId, organizationId))) {
    return { ok: false, error: "Rule set not found." };
  }
  const [existing] = await db
    .select()
    .from(pricingChannelRules)
    .where(
      and(
        eq(pricingChannelRules.ruleSetId, v.ruleSetId),
        eq(pricingChannelRules.organizationId, organizationId),
        eq(pricingChannelRules.channelKey, v.channelKey),
      ),
    )
    .limit(1);
  const values = {
    organizationId,
    ruleSetId: v.ruleSetId,
    channelKey: v.channelKey,
    modifierType: v.modifierType,
    modifierValueNumeric:
      v.modifierValueNumeric != null ? String(v.modifierValueNumeric) : null,
    modifierAmountMinor:
      v.modifierAmountMinor != null ? BigInt(v.modifierAmountMinor) : null,
    commissionModel: v.commissionModel ?? null,
    status: "active" as const,
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(pricingChannelRules)
      .set(values)
      .where(
        and(
          eq(pricingChannelRules.id, existing.id),
          eq(pricingChannelRules.organizationId, organizationId),
        ),
      );
  } else {
    await db.insert(pricingChannelRules).values(values);
  }
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.channel.upsert",
    entityType: "pricing_channel_rule",
    entityId: existing?.id ?? null,
    after: { channelKey: v.channelKey, modifierType: v.modifierType },
  });
  revalidatePath(`/dashboard/pricing/rule-sets/${v.ruleSetId}`);
  return { ok: true };
}

export async function createMinStayRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  const raw = Object.fromEntries(formData.entries());
  // weekday_mask is an array — if posted as comma-separated string, split.
  const maskRaw = formData.get("weekdayMask");
  const weekdayMask =
    typeof maskRaw === "string" && maskRaw.trim().length > 0
      ? maskRaw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
      : undefined;
  const parsed = createMinStayRuleSchema.safeParse({
    ...raw,
    weekdayMask,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const v = parsed.data;
  if (!(await ruleSetInOrg(v.ruleSetId, organizationId))) {
    return { ok: false, error: "Rule set not found." };
  }
  await db.insert(pricingMinStayRules).values({
    organizationId,
    ruleSetId: v.ruleSetId,
    name: v.name,
    startsOn: v.startsOn ?? null,
    endsOn: v.endsOn ?? null,
    weekdayMask: v.weekdayMask ?? null,
    minLos: v.minLos,
    maxLos: v.maxLos ?? null,
    priority: v.priority,
    status: "active",
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.min_stay.create",
    entityType: "pricing_min_stay_rule",
    entityId: null,
    after: { name: v.name, minLos: v.minLos },
  });
  revalidatePath(`/dashboard/pricing/rule-sets/${v.ruleSetId}`);
  return { ok: true };
}

export async function createStopSellRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  const parsed = createStopSellRuleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const v = parsed.data;
  if (!(await ruleSetInOrg(v.ruleSetId, organizationId))) {
    return { ok: false, error: "Rule set not found." };
  }
  await db.insert(pricingStopSellRules).values({
    organizationId,
    ruleSetId: v.ruleSetId,
    name: v.name,
    startsOn: v.startsOn,
    endsOn: v.endsOn,
    reason: v.reason,
    channelKey: v.channelKey ?? null,
    status: "active",
    createdBy: me?.id ?? null,
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.stop_sell.create",
    entityType: "pricing_stop_sell_rule",
    entityId: null,
    after: { name: v.name, startsOn: v.startsOn, endsOn: v.endsOn },
  });
  revalidatePath(`/dashboard/pricing/rule-sets/${v.ruleSetId}`);
  return { ok: true };
}

export async function archivePricingRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  const parsed = archivePricingRuleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const target =
    parsed.data.ruleType === "day_of_week"
      ? pricingDayOfWeekRules
      : parsed.data.ruleType === "occupancy"
        ? pricingOccupancyRules
        : parsed.data.ruleType === "close_out"
          ? pricingCloseOutRules
          : parsed.data.ruleType === "channel"
            ? pricingChannelRules
            : parsed.data.ruleType === "min_stay"
              ? pricingMinStayRules
              : pricingStopSellRules;
  await db
    .update(target)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(target.id, parsed.data.id),
        eq(target.organizationId, organizationId),
      ),
    );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `dynamic_pricing.${parsed.data.ruleType}.archive`,
    entityType: `pricing_${parsed.data.ruleType}_rule`,
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/pricing");
  return { ok: true };
}

// =============================================================================
// QUOTES + CHANNEL PUSH
// =============================================================================

export async function adminQuoteStayAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { result?: unknown }> {
  await requirePermission("pricing_quote.read");
  const parsed = adminQuoteStaySchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  // Dashboard quote tester — pass the caller's org so a cross-org villaId
  // resolves to no rule set (empty stay) instead of pricing a foreign villa.
  const organizationId = await requireOrgId();
  const result = await quoteDynamicStay({
    villaId: parsed.data.villaId,
    checkIn: parsed.data.checkIn,
    checkOut: parsed.data.checkOut,
    channelKey: parsed.data.channelKey,
    publicQuote: false,
    organizationId,
  });
  return {
    ok: true,
    result: {
      stay: serializeStay(result.stay),
      ruleSetId: result.ruleSet?.id ?? null,
      ruleSetName: result.ruleSet?.name ?? null,
    },
  };
}

export async function simulateChannelPushAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { eventCode?: string }> {
  await requirePermission("pricing_channel_push.simulate");
  const parsed = simulateChannelPushSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const out = await simulateChannelPushForRatePlan({
    ruleSetId: parsed.data.ruleSetId,
    dateStart: parsed.data.dateStart,
    dateEnd: parsed.data.dateEnd,
    channelKey: parsed.data.channelKey,
    eventType: parsed.data.eventType,
    createdBy: me?.id ?? null,
    organizationId,
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.channel_push.simulate",
    entityType: "channel_push_event",
    entityId: out.id,
    after: {
      ruleSetId: parsed.data.ruleSetId,
      channelKey: parsed.data.channelKey,
      eventType: parsed.data.eventType,
    },
  });
  revalidatePath("/dashboard/pricing/channel-push");
  return { ok: true, eventCode: out.eventCode };
}

// =============================================================================
// MANUAL RATE OVERRIDES (per villa + night) — drag pins / override form
// =============================================================================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function upsertVillaRateOverrideAction(
  villaId: string,
  stayDate: string,
  nightlyRateMinor: number,
  note?: string | null,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  if (!villaId || !ISO_DATE_RE.test(stayDate)) {
    return { ok: false, error: "Invalid villa or date." };
  }
  if (!Number.isFinite(nightlyRateMinor) || nightlyRateMinor <= 0) {
    return { ok: false, error: "Rate must be greater than zero." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  // The (villaId, stayDate) unique key lets a cross-org villaId overwrite
  // another tenant's override. Verify the villa belongs to the caller's org
  // (via projects.organization_id) BEFORE the upsert, and stamp the org on
  // the row.
  const [villa] = await db
    .select({ id: villas.id })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(and(eq(villas.id, villaId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!villa) return { ok: false, error: "Villa not found." };
  const rateMinor = BigInt(Math.round(nightlyRateMinor));
  await db
    .insert(villaRateOverrides)
    .values({
      organizationId,
      villaId,
      stayDate,
      nightlyRateMinor: rateMinor,
      note: note ?? null,
      createdBy: me?.id ?? null,
    })
    .onConflictDoUpdate({
      target: [villaRateOverrides.villaId, villaRateOverrides.stayDate],
      set: { nightlyRateMinor: rateMinor, note: note ?? null, updatedAt: new Date() },
    });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.override.upsert",
    entityType: "villa_rate_override",
    entityId: null,
    after: { villaId, stayDate, nightlyRateMinor },
  });
  revalidatePath("/dashboard/pricing");
  revalidatePath("/dashboard/pricing/calendar");
  return { ok: true };
}

export async function deleteVillaRateOverrideAction(
  villaId: string,
  stayDate: string,
): Promise<ActionResult> {
  await requirePermission("dynamic_pricing.write");
  if (!villaId || !ISO_DATE_RE.test(stayDate)) {
    return { ok: false, error: "Invalid villa or date." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  await db
    .delete(villaRateOverrides)
    .where(
      and(
        eq(villaRateOverrides.villaId, villaId),
        eq(villaRateOverrides.organizationId, organizationId),
        eq(villaRateOverrides.stayDate, stayDate),
      ),
    );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "dynamic_pricing.override.delete",
    entityType: "villa_rate_override",
    entityId: null,
    after: { villaId, stayDate },
  });
  revalidatePath("/dashboard/pricing");
  revalidatePath("/dashboard/pricing/calendar");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// internals
// -----------------------------------------------------------------------------

import type { QuoteStay } from "./quote-pure";

function serializeStay(stay: QuoteStay): Record<string, unknown> {
  return {
    available: stay.available,
    reason: stay.reason,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    nights: stay.nights,
    currency: stay.currency,
    totalMinor: stay.totalMinor.toString(),
    averageNightlyMinor: stay.averageNightlyMinor.toString(),
    requiredMinLos: stay.requiredMinLos,
    minLosName: stay.minLosName,
    explanationSummary: stay.explanationSummary,
    nightly: stay.nightly.map((n) => ({
      date: n.date,
      baseRateMinor: n.baseRateMinor.toString(),
      finalRateMinor: n.finalRateMinor.toString(),
      currency: n.currency,
      available: n.available,
      unavailableReason: n.unavailableReason,
      explanationSteps: n.explanationSteps.map((s) => ({
        label: s.label,
        type: s.type,
        amountDeltaMinor: s.amountDeltaMinor?.toString() ?? null,
        percentDelta: s.percentDelta,
        beforeMinor: s.beforeMinor.toString(),
        afterMinor: s.afterMinor.toString(),
      })),
    })),
  };
}
