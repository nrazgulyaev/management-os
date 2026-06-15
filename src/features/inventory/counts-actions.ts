"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  inventoryCountLines,
  inventoryCounts,
  inventoryLocations,
} from "@/lib/db/schema/inventory";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { applyMovement } from "./actions";
import { buildCountCode } from "./codes";
import { computeCountVariance } from "./counts";
import { nextCountCounter, preloadCountLinesForLocation } from "./counts-services";
import { asNumber } from "./stock";
import type { ActionResult } from "@/features/projects/actions";

const createCountSchema = z.object({
  locationId: z.string().uuid(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
const countIdSchema = z.object({ id: z.string().uuid() });
const lineUpdateSchema = z.object({
  lineId: z.string().uuid(),
  countedQuantity: z.coerce.number().nonnegative(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export async function createInventoryCountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.count.write");
  const parsed = createCountSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  // TENANCY: a client-supplied locationId must belong to the caller's org
  // before we anchor a count to it (otherwise the count + its preloaded lines
  // would be stamped to our org but reference a foreign location).
  const [location] = await db
    .select({ id: inventoryLocations.id })
    .from(inventoryLocations)
    .where(and(
      eq(inventoryLocations.id, parsed.data.locationId),
      eq(inventoryLocations.organizationId, organizationId),
    ))
    .limit(1);
  if (!location) return { ok: false, error: "Location not found." };

  const counter = await nextCountCounter();
  const code = buildCountCode(counter);

  const [row] = await db
    .insert(inventoryCounts)
    .values({
      organizationId,
      countCode: code,
      locationId: parsed.data.locationId,
      countedBy: me?.id ?? null,
      status: "draft",
      notes: parsed.data.notes && parsed.data.notes !== "" ? parsed.data.notes : null,
    })
    .returning({ id: inventoryCounts.id });

  await preloadCountLinesForLocation(row.id, parsed.data.locationId);

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.count.create",
    entityType: "inventory_count",
    entityId: row.id,
    after: { code, locationId: parsed.data.locationId },
  });

  revalidatePath("/dashboard/inventory/counts");
  return { ok: true, redirectTo: `/dashboard/inventory/counts/${row.id}` };
}

export async function updateInventoryCountLineAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.count.write");
  const parsed = lineUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Please review the line." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();

  // TENANCY: scope the load (and the update) so a cross-org line id reads as
  // "not found" before we touch it.
  const [line] = await db
    .select()
    .from(inventoryCountLines)
    .where(and(
      eq(inventoryCountLines.id, parsed.data.lineId),
      eq(inventoryCountLines.organizationId, organizationId),
    ))
    .limit(1);
  if (!line) return { ok: false, error: "Line not found." };

  const expected = line.expectedQuantity === null ? null : asNumber(line.expectedQuantity);
  const variance = computeCountVariance({
    itemId: line.itemId,
    expectedQuantity: expected,
    countedQuantity: parsed.data.countedQuantity,
  }).variance;

  await db
    .update(inventoryCountLines)
    .set({
      countedQuantity: String(parsed.data.countedQuantity),
      varianceQuantity: String(variance),
      notes: parsed.data.notes && parsed.data.notes !== "" ? parsed.data.notes : line.notes,
    })
    .where(and(
      eq(inventoryCountLines.id, parsed.data.lineId),
      eq(inventoryCountLines.organizationId, organizationId),
    ));

  return { ok: true };
}

export async function submitInventoryCountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.count.write");
  const parsed = countIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing count id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  // TENANCY: a cross-org count id reads as not-found before any line/status write.
  const [count] = await db
    .select()
    .from(inventoryCounts)
    .where(and(eq(inventoryCounts.id, parsed.data.id), eq(inventoryCounts.organizationId, organizationId)))
    .limit(1);
  if (!count) return { ok: false, error: "Count not found." };
  if (count.status !== "draft") {
    return { ok: false, error: `Cannot submit a count in status "${count.status}".` };
  }

  // Recompute every line's variance from current numbers, in case lines were edited.
  const lines = await db
    .select()
    .from(inventoryCountLines)
    .where(eq(inventoryCountLines.countId, parsed.data.id));
  for (const l of lines) {
    const v = computeCountVariance({
      itemId: l.itemId,
      expectedQuantity: l.expectedQuantity === null ? null : asNumber(l.expectedQuantity),
      countedQuantity: asNumber(l.countedQuantity),
    }).variance;
    await db
      .update(inventoryCountLines)
      .set({ varianceQuantity: String(v) })
      .where(eq(inventoryCountLines.id, l.id));
  }

  await db
    .update(inventoryCounts)
    .set({ status: "submitted", countedAt: new Date(), countedBy: me?.id ?? null })
    .where(and(eq(inventoryCounts.id, parsed.data.id), eq(inventoryCounts.organizationId, organizationId)));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.count.submit",
    entityType: "inventory_count",
    entityId: parsed.data.id,
    after: { lineCount: lines.length },
  });

  revalidatePath(`/dashboard/inventory/counts/${parsed.data.id}`);
  revalidatePath("/dashboard/inventory/counts");
  return { ok: true };
}

export async function approveInventoryCountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.count.approve");
  const parsed = countIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing count id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  // TENANCY: a cross-org count id reads as not-found (its per-line
  // applyMovement is org-guarded too).
  const [count] = await db
    .select()
    .from(inventoryCounts)
    .where(and(eq(inventoryCounts.id, parsed.data.id), eq(inventoryCounts.organizationId, organizationId)))
    .limit(1);
  if (!count) return { ok: false, error: "Count not found." };
  if (count.status !== "submitted") {
    return { ok: false, error: "Only submitted counts can be approved." };
  }

  const lines = await db
    .select()
    .from(inventoryCountLines)
    .where(eq(inventoryCountLines.countId, parsed.data.id));

  // Generate one count_correction movement per non-zero variance.
  for (const l of lines) {
    const variance = l.varianceQuantity === null ? 0 : asNumber(l.varianceQuantity);
    if (variance === 0) continue;
    const result = await applyMovement({
      itemId: l.itemId,
      type: "count_correction",
      quantity: variance,
      toLocationId: count.locationId,
      reason: `Count ${count.countCode} reconciliation`,
      actorUserId: me?.id ?? null,
      // count_corrections may go negative — counts can find less than expected.
      allowNegative: true,
    });
    if ("error" in result) {
      return { ok: false, error: `Movement failed: ${result.error}` };
    }
  }

  await db
    .update(inventoryCounts)
    .set({
      status: "adjusted",
      approvedAt: new Date(),
      approvedBy: me?.id ?? null,
    })
    .where(and(eq(inventoryCounts.id, parsed.data.id), eq(inventoryCounts.organizationId, organizationId)));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.count.approve",
    entityType: "inventory_count",
    entityId: parsed.data.id,
    after: {
      adjustments: lines.filter(
        (l) => l.varianceQuantity !== null && asNumber(l.varianceQuantity) !== 0,
      ).length,
    },
  });

  revalidatePath(`/dashboard/inventory/counts/${parsed.data.id}`);
  revalidatePath("/dashboard/inventory/counts");
  revalidatePath("/dashboard/inventory/movements");
  return { ok: true };
}

export async function cancelInventoryCountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("inventory.count.write");
  const parsed = countIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing count id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Tenant scope: a foreign count id reads as not-found before the cancel.
  const [count] = await db
    .select({ id: inventoryCounts.id })
    .from(inventoryCounts)
    .where(
      and(
        eq(inventoryCounts.id, parsed.data.id),
        eq(inventoryCounts.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!count) return { ok: false, error: "Count not found." };

  await db
    .update(inventoryCounts)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(inventoryCounts.id, parsed.data.id),
        eq(inventoryCounts.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inventory.count.cancel",
    entityType: "inventory_count",
    entityId: parsed.data.id,
  });

  revalidatePath(`/dashboard/inventory/counts/${parsed.data.id}`);
  revalidatePath("/dashboard/inventory/counts");
  return { ok: true };
}
