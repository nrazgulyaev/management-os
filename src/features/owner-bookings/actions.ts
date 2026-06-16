"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  rebuildOwnerBookingSummariesForAllOwners,
  rebuildOwnerBookingSummaryForBooking,
  rebuildOwnerBookingSummaryForDirectRequest,
  rebuildOwnerRevenueSourceMonthlyForAllOwners,
} from "./projection";
import type { ActionResult } from "@/features/projects/actions";

const bookingIdSchema = z.object({ bookingId: z.string().uuid() });
const requestIdSchema = z.object({ requestId: z.string().uuid() });

export async function rebuildOwnerBookingSummariesAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult & { ownersProcessed?: number; summaries?: number }> {
  await requirePermission("owner_booking.manage");
  const me = await getCurrentAppUser();
  const out = await rebuildOwnerBookingSummariesForAllOwners();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_booking.projection.rebuild_all",
    entityType: "owner_booking_summary",
    entityId: null,
    after: out,
  });
  revalidatePath("/dashboard/owner-intelligence/bookings");
  revalidatePath("/dashboard/owner-intelligence/revenue");
  revalidatePath("/owner/bookings");
  revalidatePath("/owner/calendar");
  revalidatePath("/owner/revenue");
  return {
    ok: true,
    ownersProcessed: out.ownersProcessed,
    summaries: out.summariesUpserted,
  };
}

export async function rebuildOwnerBookingSummaryForBookingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_booking.manage");
  const parsed = bookingIdSchema.safeParse({
    bookingId: formData.get("bookingId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid bookingId" };
  const me = await getCurrentAppUser();
  // TENANCY: scope the rebuild to the caller's org so a foreign bookingId
  // can't trigger a cross-tenant owner-projection recompute.
  const organizationId = await requireOrgId();
  const out = await rebuildOwnerBookingSummaryForBooking(
    parsed.data.bookingId,
    organizationId,
  );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_booking.projection.rebuild_booking",
    entityType: "booking",
    entityId: parsed.data.bookingId,
    after: out,
  });
  revalidatePath("/dashboard/owner-intelligence/bookings");
  revalidatePath("/owner/bookings");
  return { ok: true };
}

export async function rebuildOwnerBookingSummaryForDirectRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_booking.manage");
  const parsed = requestIdSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid requestId" };
  const me = await getCurrentAppUser();
  // TENANCY: scope the rebuild to the caller's org so a foreign requestId
  // can't trigger a cross-tenant owner-projection recompute.
  const organizationId = await requireOrgId();
  const out = await rebuildOwnerBookingSummaryForDirectRequest(
    parsed.data.requestId,
    organizationId,
  );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_booking.projection.rebuild_direct_request",
    entityType: "direct_booking_request",
    entityId: parsed.data.requestId,
    after: out,
  });
  revalidatePath("/dashboard/owner-intelligence/bookings");
  revalidatePath("/owner/bookings");
  return { ok: true };
}

export async function rebuildOwnerRevenueSourceMonthlyAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult & { upserted?: number }> {
  await requirePermission("owner_revenue.manage");
  const me = await getCurrentAppUser();
  const out = await rebuildOwnerRevenueSourceMonthlyForAllOwners();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_revenue.monthly.rebuild_all",
    entityType: "owner_revenue_source_monthly",
    entityId: null,
    after: out,
  });
  revalidatePath("/dashboard/owner-intelligence/revenue");
  revalidatePath("/owner/revenue");
  return { ok: true, upserted: out.upserted };
}
