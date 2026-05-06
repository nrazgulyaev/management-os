"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  postDirectBookingRevenue,
  reconcileDirectBookingsBatch,
  reverseDirectBookingFinanceLink,
} from "./finance-reconciliation";
import { expireDeposit } from "./deposit-expiry";
import type { ActionResult } from "@/features/projects/actions";

const requestIdSchema = z.object({ requestId: z.string().uuid() });
const linkIdSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});
const depositIdSchema = z.object({ id: z.string().uuid() });

export async function postDirectBookingRevenueAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { status?: string }> {
  await requirePermission("direct_booking.reconcile.write");
  const parsed = requestIdSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const out = await postDirectBookingRevenue(
    parsed.data.requestId,
    me?.id ?? null,
  );
  revalidatePath(
    `/dashboard/direct-bookings/requests/${parsed.data.requestId}`,
  );
  revalidatePath("/dashboard/direct-bookings/reconciliation");
  if (!out.ok) return { ok: false, error: out.reason, status: out.status };
  return { ok: true, status: out.status };
}

export async function reverseDirectBookingFinanceLinkAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.reconcile.reverse");
  const parsed = linkIdSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const out = await reverseDirectBookingFinanceLink(
    parsed.data.id,
    me?.id ?? null,
    parsed.data.reason ?? "manual_reversal",
  );
  if (!out.ok) return { ok: false, error: out.reason ?? "reverse_failed" };
  revalidatePath(`/dashboard/direct-bookings/reconciliation/${parsed.data.id}`);
  revalidatePath("/dashboard/direct-bookings/reconciliation");
  return { ok: true };
}

export async function reconcilePendingDirectBookingsAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<
  ActionResult & { posted?: number; skipped?: number; failed?: number }
> {
  await requirePermission("direct_booking.reconcile.write");
  const me = await getCurrentAppUser();
  const out = await reconcileDirectBookingsBatch(50, me?.id ?? null);
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.reconcile.batch",
    entityType: "direct_booking_finance_link",
    entityId: null,
    after: out,
  });
  revalidatePath("/dashboard/direct-bookings/reconciliation");
  return { ok: true, ...out };
}

export async function expireDepositNowAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.deposit.expire");
  const parsed = depositIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const out = await expireDeposit(parsed.data.id, me?.id ?? null);
  if (!out.ok) return { ok: false, error: out.reason ?? "expire_failed" };
  revalidatePath("/dashboard/direct-bookings/deposits");
  revalidatePath(`/dashboard/direct-bookings/deposits/${parsed.data.id}`);
  return { ok: true };
}
