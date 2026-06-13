"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestServiceFulfilments,
  guestServiceRatings,
  serviceFulfilmentEvents,
  serviceVendorInvoices,
  serviceVendorServices,
  serviceVendorTokens,
  serviceVendors,
  type GuestServiceFulfilment,
} from "@/lib/db/schema/service-fulfilment";
import {
  guestServiceOrders,
  guestServices,
} from "@/lib/db/schema/guest-services";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  assignFulfilmentStaffSchema,
  assignFulfilmentVendorSchema,
  attachVendorToServiceSchema,
  bridgeFulfilmentSchema,
  cancelFulfilmentSchema,
  completeFulfilmentSchema,
  createFulfilmentSchema,
  createServiceVendorSchema,
  createVendorInvoiceSchema,
  failFulfilmentSchema,
  flagRatingSchema,
  guestConfirmFulfilmentSchema,
  invoiceIdSchema,
  issueVendorTokenSchema,
  ratingIdSchema,
  requestGuestConfirmationSchema,
  reverseBridgeSchema,
  revokeVendorTokenSchema,
  submitGuestServiceRatingSchema,
  transitionFulfilmentStatusSchema,
  updateFulfilmentEtaSchema,
  updateFulfilmentScheduleSchema,
  updateServiceVendorSchema,
  vendorDeclineSchema,
  vendorEtaSchema,
  vendorIdSchema,
  vendorMarkSchema,
  vendorServiceIdSchema,
  vendorTokenActionSchema,
} from "./schema";
import {
  buildFulfilmentCode,
  randomFulfilmentSuffix,
  todayUtcIsoDate,
} from "./codes";
import {
  canTransitionFulfilmentStatus,
  type FulfilmentStatus,
} from "./status-pure";
import { calculateServiceMargin } from "./pricing-pure";
import {
  defaultVendorTokenExpiry,
  generateVendorToken,
  hashVendorToken,
  tokenPrefixFromVendorToken,
} from "./vendor-token";
import {
  bridgeFulfilmentToFinance,
  bridgePendingFulfilmentsToFinance,
  reverseFulfilmentFinanceBridge,
} from "./finance-bridge";
import {
  notifyFulfilmentCancelled,
  notifyFulfilmentCompleted,
  notifyFulfilmentCreated,
  notifyFulfilmentEtaUpdated,
  notifyFulfilmentScheduled,
  notifyGuestConfirmationRequested,
  notifyVendorAssigned,
  notifyVendorConfirmed,
  notifyVendorInvoiceReceived,
} from "./notifications";
import type { ActionResult } from "@/features/projects/actions";

// =============================================================================
// VENDOR REGISTRY
// =============================================================================

export async function createServiceVendorAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requirePermission("service_vendor.write");
  const parsed = createServiceVendorSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const v = parsed.data;
  const [row] = await db
    .insert(serviceVendors)
    .values({
      vendorCode: v.vendorCode,
      displayName: v.displayName,
      legalName: v.legalName ?? null,
      vendorType: v.vendorType,
      contactName: v.contactName ?? null,
      contactPhone: v.contactPhone ?? null,
      contactEmail: v.contactEmail ?? null,
      preferredChannel: v.preferredChannel ?? null,
      serviceArea: v.serviceArea ?? null,
      defaultCurrency: v.defaultCurrency,
      internalNotes: v.internalNotes ?? null,
      createdBy: me?.id ?? null,
    })
    .returning({ id: serviceVendors.id });
  if (!row) return { ok: false, error: "Insert failed." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_vendor.create",
    entityType: "service_vendor",
    entityId: row.id,
    after: { vendorCode: v.vendorCode, displayName: v.displayName },
  });
  revalidatePath("/dashboard/service-fulfilment/vendors");
  return { ok: true, id: row.id };
}

export async function updateServiceVendorAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_vendor.write");
  const parsed = updateServiceVendorSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const { id, ...values } = parsed.data;
  await db
    .update(serviceVendors)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(serviceVendors.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_vendor.update",
    entityType: "service_vendor",
    entityId: id,
    after: values as Record<string, unknown>,
  });
  revalidatePath(`/dashboard/service-fulfilment/vendors/${id}`);
  return { ok: true };
}

async function setVendorStatus(
  id: string,
  status: "active" | "paused" | "archived",
): Promise<ActionResult> {
  await requirePermission("service_vendor.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(serviceVendors)
    .set({ status, updatedAt: new Date() })
    .where(eq(serviceVendors.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `service_vendor.${status}`,
    entityType: "service_vendor",
    entityId: id,
  });
  revalidatePath("/dashboard/service-fulfilment/vendors");
  revalidatePath(`/dashboard/service-fulfilment/vendors/${id}`);
  return { ok: true };
}

export async function pauseServiceVendorAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = vendorIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setVendorStatus(parsed.data.id, "paused");
}

export async function archiveServiceVendorAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = vendorIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setVendorStatus(parsed.data.id, "archived");
}

export async function attachVendorToServiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_vendor.write");
  const parsed = attachVendorToServiceSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const v = parsed.data;
  const [existing] = await db
    .select()
    .from(serviceVendorServices)
    .where(
      and(
        eq(serviceVendorServices.vendorId, v.vendorId),
        eq(serviceVendorServices.serviceId, v.serviceId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(serviceVendorServices)
      .set({
        status: "active",
        baseCostMinor: v.baseCostMinor != null ? BigInt(v.baseCostMinor) : null,
        currency: v.currency ?? null,
        leadTimeMinutes: v.leadTimeMinutes ?? null,
        minNoticeMinutes: v.minNoticeMinutes ?? null,
        notes: v.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(serviceVendorServices.id, existing.id));
  } else {
    await db.insert(serviceVendorServices).values({
      vendorId: v.vendorId,
      serviceId: v.serviceId,
      status: "active",
      baseCostMinor: v.baseCostMinor != null ? BigInt(v.baseCostMinor) : null,
      currency: v.currency ?? null,
      leadTimeMinutes: v.leadTimeMinutes ?? null,
      minNoticeMinutes: v.minNoticeMinutes ?? null,
      notes: v.notes ?? null,
    });
  }
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_vendor.service.attach",
    entityType: "service_vendor",
    entityId: v.vendorId,
    after: { serviceId: v.serviceId },
  });
  revalidatePath(`/dashboard/service-fulfilment/vendors/${v.vendorId}`);
  return { ok: true };
}

export async function pauseVendorServiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_vendor.write");
  const parsed = vendorServiceIdSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  await db
    .update(serviceVendorServices)
    .set({ status: "paused", updatedAt: new Date() })
    .where(
      and(
        eq(serviceVendorServices.vendorId, parsed.data.vendorId),
        eq(serviceVendorServices.serviceId, parsed.data.serviceId),
      ),
    );
  revalidatePath(
    `/dashboard/service-fulfilment/vendors/${parsed.data.vendorId}`,
  );
  return { ok: true };
}

// =============================================================================
// FULFILMENT
// =============================================================================

export async function createFulfilmentForOrderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requirePermission("service_fulfilment.write");
  const parsed = createFulfilmentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const v = parsed.data;
  const [order] = await db
    .select()
    .from(guestServiceOrders)
    .where(eq(guestServiceOrders.id, v.orderId))
    .limit(1);
  if (!order) return { ok: false, error: "Order not found." };
  const [existing] = await db
    .select()
    .from(guestServiceFulfilments)
    .where(eq(guestServiceFulfilments.orderId, v.orderId))
    .limit(1);
  if (existing) return { ok: true, id: existing.id };

  const fulfilmentCode = await pickUniqueFulfilmentCode(db);
  const [service] = await db
    .select({ requiresAdminConfirmation: guestServices.requiresAdminConfirmation, name: guestServices.name })
    .from(guestServices)
    .where(eq(guestServices.id, order.serviceId))
    .limit(1);
  const [row] = await db
    .insert(guestServiceFulfilments)
    .values({
      orderId: v.orderId,
      fulfilmentCode,
      vendorId: v.vendorId ?? null,
      assignedToAppUserId: v.assignedToAppUserId ?? null,
      status: service?.requiresAdminConfirmation ? "triage" : "scheduled",
      fulfilmentType: v.fulfilmentType,
      scheduledFor: v.scheduledFor ? new Date(v.scheduledFor) : null,
      currency: order.currency,
      guestPriceMinor: order.guestPriceMinor,
      internalCostMinor: order.internalCostMinor ?? null,
      requiresGuestConfirmation: !!service?.requiresAdminConfirmation,
      internalNotes: v.internalNotes ?? null,
      createdBy: me?.id ?? null,
    })
    .returning({ id: guestServiceFulfilments.id });
  if (!row) return { ok: false, error: "Insert failed." };
  await appendEvent(db, row.id, {
    eventType: "created",
    actorType: me ? "admin" : "system",
    actorAppUserId: me?.id ?? null,
    title: `Fulfilment ${fulfilmentCode} created`,
  });
  await notifyFulfilmentCreated({
    fulfilmentId: row.id,
    fulfilmentCode,
    serviceName: service?.name ?? "service",
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_fulfilment.create",
    entityType: "guest_service_fulfilment",
    entityId: row.id,
    after: { orderId: v.orderId, fulfilmentCode },
  });
  revalidatePath("/dashboard/service-fulfilment");
  revalidatePath("/dashboard/service-fulfilment/fulfilments");
  return { ok: true, id: row.id };
}

export async function assignFulfilmentVendorAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.dispatch");
  const parsed = assignFulfilmentVendorSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const v = parsed.data;
  const [vendor] = await db
    .select()
    .from(serviceVendors)
    .where(eq(serviceVendors.id, v.vendorId))
    .limit(1);
  if (!vendor) return { ok: false, error: "Vendor not found." };

  await db
    .update(guestServiceFulfilments)
    .set({
      vendorId: v.vendorId,
      vendorQuoteMinor:
        v.vendorQuoteMinor != null ? BigInt(v.vendorQuoteMinor) : null,
      fulfilmentType: v.fulfilmentType ?? "vendor",
      status: "awaiting_vendor",
      updatedAt: new Date(),
    })
    .where(eq(guestServiceFulfilments.id, v.id));
  await appendEvent(db, v.id, {
    eventType: "assigned",
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    vendorId: v.vendorId,
    title: `Vendor assigned: ${vendor.displayName}`,
  });
  await notifyVendorAssigned({
    fulfilmentId: v.id,
    fulfilmentCode: await fulfilmentCodeOf(db, v.id),
    vendorName: vendor.displayName,
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_fulfilment.assign_vendor",
    entityType: "guest_service_fulfilment",
    entityId: v.id,
    after: { vendorId: v.vendorId },
  });
  revalidatePath(`/dashboard/service-fulfilment/fulfilments/${v.id}`);
  return { ok: true };
}

export async function assignFulfilmentStaffAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.dispatch");
  const parsed = assignFulfilmentStaffSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(guestServiceFulfilments)
    .set({
      assignedToAppUserId: parsed.data.appUserId,
      updatedAt: new Date(),
    })
    .where(eq(guestServiceFulfilments.id, parsed.data.id));
  await appendEvent(db, parsed.data.id, {
    eventType: "assigned",
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    title: "Staff assigned",
    metadataJson: { staffAppUserId: parsed.data.appUserId },
  });
  revalidatePath(
    `/dashboard/service-fulfilment/fulfilments/${parsed.data.id}`,
  );
  return { ok: true };
}

export async function updateFulfilmentScheduleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.write");
  const parsed = updateFulfilmentScheduleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const ts = new Date(parsed.data.scheduledFor);
  await db
    .update(guestServiceFulfilments)
    .set({ scheduledFor: ts, updatedAt: new Date() })
    .where(eq(guestServiceFulfilments.id, parsed.data.id));
  await appendEvent(db, parsed.data.id, {
    eventType: "scheduled",
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    title: `Scheduled for ${ts.toISOString()}`,
  });
  const [info] = await db
    .select({
      stayTokenId: guestServiceOrders.guestStayTokenId,
      serviceName: guestServices.name,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(eq(guestServiceFulfilments.id, parsed.data.id))
    .limit(1);
  if (info) {
    await notifyFulfilmentScheduled({
      fulfilmentId: parsed.data.id,
      stayTokenId: info.stayTokenId,
      serviceName: info.serviceName ?? "service",
      scheduledFor: ts,
    });
  }
  revalidatePath(
    `/dashboard/service-fulfilment/fulfilments/${parsed.data.id}`,
  );
  return { ok: true };
}

export async function updateFulfilmentEtaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.write");
  const parsed = updateFulfilmentEtaSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const ts = new Date(parsed.data.etaAt);
  await db
    .update(guestServiceFulfilments)
    .set({ etaAt: ts, updatedAt: new Date() })
    .where(eq(guestServiceFulfilments.id, parsed.data.id));
  await appendEvent(db, parsed.data.id, {
    eventType: "eta_updated",
    actorType: parsed.data.source === "vendor" ? "vendor" : "admin",
    actorAppUserId: me?.id ?? null,
    title: `ETA ${ts.toISOString()}`,
  });
  const [info] = await db
    .select({
      stayTokenId: guestServiceOrders.guestStayTokenId,
      serviceName: guestServices.name,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(eq(guestServiceFulfilments.id, parsed.data.id))
    .limit(1);
  if (info) {
    await notifyFulfilmentEtaUpdated({
      fulfilmentId: parsed.data.id,
      stayTokenId: info.stayTokenId,
      serviceName: info.serviceName ?? "service",
      etaAt: ts,
    });
  }
  revalidatePath(
    `/dashboard/service-fulfilment/fulfilments/${parsed.data.id}`,
  );
  return { ok: true };
}

export async function transitionFulfilmentStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.write");
  const parsed = transitionFulfilmentStatusSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const [current] = await db
    .select()
    .from(guestServiceFulfilments)
    .where(eq(guestServiceFulfilments.id, parsed.data.id))
    .limit(1);
  if (!current) return { ok: false, error: "Fulfilment not found." };
  if (
    !canTransitionFulfilmentStatus(
      current.status as FulfilmentStatus,
      parsed.data.to as FulfilmentStatus,
    )
  ) {
    return {
      ok: false,
      error: `Cannot transition ${current.status} → ${parsed.data.to}`,
    };
  }
  const me = await getCurrentAppUser();
  const ts = new Date();
  const updates: Partial<GuestServiceFulfilment> = {
    status: parsed.data.to,
    updatedAt: ts,
  };
  if (parsed.data.to === "vendor_confirmed") updates.vendorConfirmedAt = ts;
  if (parsed.data.to === "guest_confirmed") updates.guestConfirmedAt = ts;
  if (parsed.data.to === "in_progress") updates.startedAt = ts;
  if (parsed.data.to === "completed") updates.completedAt = ts;
  if (parsed.data.to === "cancelled") {
    updates.cancelledAt = ts;
    updates.cancellationReason = parsed.data.reason ?? null;
  }
  await db
    .update(guestServiceFulfilments)
    .set(updates)
    .where(eq(guestServiceFulfilments.id, parsed.data.id));
  await appendEvent(db, parsed.data.id, {
    eventType: parsed.data.to,
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    title: `Status → ${parsed.data.to}`,
    description: parsed.data.reason ?? null,
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `service_fulfilment.transition.${parsed.data.to}`,
    entityType: "guest_service_fulfilment",
    entityId: parsed.data.id,
    after: { from: current.status, to: parsed.data.to },
  });
  revalidatePath(
    `/dashboard/service-fulfilment/fulfilments/${parsed.data.id}`,
  );
  return { ok: true };
}

export async function cancelFulfilmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.write");
  const parsed = cancelFulfilmentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const ts = new Date();
  await db
    .update(guestServiceFulfilments)
    .set({
      status: "cancelled",
      cancelledAt: ts,
      cancellationReason: parsed.data.reason ?? null,
      updatedAt: ts,
    })
    .where(eq(guestServiceFulfilments.id, parsed.data.id));
  await appendEvent(db, parsed.data.id, {
    eventType: "cancelled",
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    title: "Cancelled",
    description: parsed.data.reason ?? null,
  });
  const [info] = await db
    .select({
      stayTokenId: guestServiceOrders.guestStayTokenId,
      serviceName: guestServices.name,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(eq(guestServiceFulfilments.id, parsed.data.id))
    .limit(1);
  if (info) {
    await notifyFulfilmentCancelled({
      fulfilmentId: parsed.data.id,
      stayTokenId: info.stayTokenId,
      serviceName: info.serviceName ?? "service",
    });
  }
  revalidatePath(
    `/dashboard/service-fulfilment/fulfilments/${parsed.data.id}`,
  );
  return { ok: true };
}

export async function requestGuestConfirmationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.write");
  const parsed = requestGuestConfirmationSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(guestServiceFulfilments)
    .set({ requiresGuestConfirmation: true, updatedAt: new Date() })
    .where(eq(guestServiceFulfilments.id, parsed.data.id));
  const [info] = await db
    .select({
      stayTokenId: guestServiceOrders.guestStayTokenId,
      serviceName: guestServices.name,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(eq(guestServiceFulfilments.id, parsed.data.id))
    .limit(1);
  if (info?.stayTokenId) {
    await notifyGuestConfirmationRequested({
      fulfilmentId: parsed.data.id,
      stayTokenId: info.stayTokenId,
      serviceName: info.serviceName ?? "service",
    });
  }
  await appendEvent(db, parsed.data.id, {
    eventType: "guest_confirmation_requested",
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    title: "Guest confirmation requested",
  });
  return { ok: true };
}

export async function guestConfirmFulfilmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Guest action — gate is the stay-token cookie / page that calls
  // this. We still verify the (fulfilment, token) pair.
  const parsed = guestConfirmFulfilmentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const [pair] = await db
    .select({
      f: guestServiceFulfilments,
      tokenId: guestServiceOrders.guestStayTokenId,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .where(eq(guestServiceFulfilments.id, parsed.data.id))
    .limit(1);
  if (!pair) return { ok: false, error: "Fulfilment not found." };
  if (pair.tokenId !== parsed.data.stayTokenId) {
    return { ok: false, error: "Token mismatch." };
  }
  const ts = new Date();
  await db
    .update(guestServiceFulfilments)
    .set({
      guestConfirmedAt: ts,
      status: "guest_confirmed",
      updatedAt: ts,
    })
    .where(eq(guestServiceFulfilments.id, parsed.data.id));
  await appendEvent(db, parsed.data.id, {
    eventType: "guest_confirmed",
    actorType: "guest",
    title: "Guest confirmed",
  });
  return { ok: true };
}

export async function completeFulfilmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.write");
  const parsed = completeFulfilmentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const ts = new Date();
  const v = parsed.data;
  // Tenant scope: prove the fulfilment belongs to the caller's org via the
  // durable NOT-NULL anchor guest_services.organization_id before completing
  // it (completion mints guest price + internal cost margin). A cross-org id
  // reads as not-found.
  const organizationId = await requireOrgId();
  const [owned] = await db
    .select({ id: guestServiceFulfilments.id })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .innerJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(
      and(
        eq(guestServiceFulfilments.id, v.id),
        eq(guestServices.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: "Fulfilment not found." };
  const guestPriceBig =
    v.guestPriceMinor != null ? BigInt(v.guestPriceMinor) : undefined;
  const internalCostBig =
    v.internalCostMinor != null ? BigInt(v.internalCostMinor) : undefined;
  const updates: Record<string, unknown> = {
    status: "completed",
    completedAt: ts,
    updatedAt: ts,
  };
  if (guestPriceBig !== undefined) updates.guestPriceMinor = guestPriceBig;
  if (internalCostBig !== undefined)
    updates.internalCostMinor = internalCostBig;
  if (v.currency) updates.currency = v.currency;
  if (guestPriceBig !== undefined && internalCostBig !== undefined) {
    updates.marginMinor = calculateServiceMargin(
      guestPriceBig,
      internalCostBig,
    );
  }
  await db
    .update(guestServiceFulfilments)
    .set(updates)
    .where(eq(guestServiceFulfilments.id, v.id));
  await appendEvent(db, v.id, {
    eventType: "completed",
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    title: "Fulfilment completed",
  });
  const [info] = await db
    .select({
      stayTokenId: guestServiceOrders.guestStayTokenId,
      serviceName: guestServices.name,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(eq(guestServiceFulfilments.id, v.id))
    .limit(1);
  if (info) {
    await notifyFulfilmentCompleted({
      fulfilmentId: v.id,
      stayTokenId: info.stayTokenId,
      serviceName: info.serviceName ?? "service",
    });
  }
  revalidatePath(`/dashboard/service-fulfilment/fulfilments/${v.id}`);
  return { ok: true };
}

export async function failFulfilmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.write");
  const parsed = failFulfilmentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const ts = new Date();
  await db
    .update(guestServiceFulfilments)
    .set({
      status: "failed",
      cancelledAt: ts,
      cancellationReason: parsed.data.reason ?? null,
      updatedAt: ts,
    })
    .where(eq(guestServiceFulfilments.id, parsed.data.id));
  await appendEvent(db, parsed.data.id, {
    eventType: "failed",
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    title: "Failed",
    description: parsed.data.reason ?? null,
  });
  return { ok: true };
}

// =============================================================================
// VENDOR TOKEN
// =============================================================================

export async function issueVendorTokenAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { token?: string }> {
  await requirePermission("service_fulfilment.dispatch");
  const parsed = issueVendorTokenSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [fulfilment] = await db
    .select()
    .from(guestServiceFulfilments)
    .where(eq(guestServiceFulfilments.id, parsed.data.fulfilmentId))
    .limit(1);
  if (!fulfilment) return { ok: false, error: "Fulfilment not found." };
  if (!fulfilment.vendorId) {
    return {
      ok: false,
      error: "Assign a vendor before issuing a portal link.",
    };
  }
  const raw = generateVendorToken();
  const tokenHash = hashVendorToken(raw);
  const tokenPrefix = tokenPrefixFromVendorToken(raw);
  const expires = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : defaultVendorTokenExpiry(fulfilment.scheduledFor);
  await db.insert(serviceVendorTokens).values({
    fulfilmentId: fulfilment.id,
    vendorId: fulfilment.vendorId,
    tokenHash,
    tokenPrefix,
    expiresAt: expires,
    createdBy: me?.id ?? null,
  });
  await appendEvent(db, fulfilment.id, {
    eventType: "vendor_contacted",
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    title: "Vendor portal link issued",
    metadataJson: {
      tokenPrefix,
      expiresAt: expires.toISOString(),
    },
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_vendor_token.issue",
    entityType: "guest_service_fulfilment",
    entityId: fulfilment.id,
    after: { tokenPrefix, expiresAt: expires.toISOString() },
  });
  return { ok: true, token: raw };
}

export async function revokeVendorTokenAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.dispatch");
  const parsed = revokeVendorTokenSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(serviceVendorTokens)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(eq(serviceVendorTokens.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_vendor_token.revoke",
    entityType: "service_vendor_token",
    entityId: parsed.data.id,
  });
  return { ok: true };
}

// Vendor-side actions — entered by the vendor portal.

async function fulfilmentFromToken(
  rawToken: string,
): Promise<{ fulfilmentId: string; vendorId: string } | null> {
  const db = getDb();
  if (!db) return null;
  const tokenHash = hashVendorToken(rawToken);
  const ts = new Date();
  const [token] = await db
    .select()
    .from(serviceVendorTokens)
    .where(
      and(
        eq(serviceVendorTokens.tokenHash, tokenHash),
        eq(serviceVendorTokens.status, "active"),
      ),
    )
    .limit(1);
  if (!token) return null;
  if (token.expiresAt.getTime() <= ts.getTime()) {
    await db
      .update(serviceVendorTokens)
      .set({ status: "expired", updatedAt: ts })
      .where(eq(serviceVendorTokens.id, token.id));
    return null;
  }
  await db
    .update(serviceVendorTokens)
    .set({
      lastAccessedAt: ts,
      accessCount: sql`${serviceVendorTokens.accessCount} + 1`,
      updatedAt: ts,
    })
    .where(eq(serviceVendorTokens.id, token.id));
  return { fulfilmentId: token.fulfilmentId, vendorId: token.vendorId };
}

export async function vendorAcceptFulfilmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = vendorTokenActionSchema.safeParse({
    token: formData.get("token"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid token." };
  const ctx = await fulfilmentFromToken(parsed.data.token);
  if (!ctx) return { ok: false, error: "Token expired or revoked." };
  const db = getDb()!;
  const ts = new Date();
  await db
    .update(guestServiceFulfilments)
    .set({
      status: "vendor_confirmed",
      vendorConfirmedAt: ts,
      updatedAt: ts,
    })
    .where(eq(guestServiceFulfilments.id, ctx.fulfilmentId));
  await appendEvent(db, ctx.fulfilmentId, {
    eventType: "vendor_confirmed",
    actorType: "vendor",
    vendorId: ctx.vendorId,
    title: "Vendor accepted",
  });
  const [vendor] = await db
    .select({ name: serviceVendors.displayName })
    .from(serviceVendors)
    .where(eq(serviceVendors.id, ctx.vendorId))
    .limit(1);
  await notifyVendorConfirmed({
    fulfilmentId: ctx.fulfilmentId,
    fulfilmentCode: await fulfilmentCodeOf(db, ctx.fulfilmentId),
    vendorName: vendor?.name ?? "vendor",
  });
  return { ok: true };
}

export async function vendorUpdateEtaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = vendorEtaSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const ctx = await fulfilmentFromToken(parsed.data.token);
  if (!ctx) return { ok: false, error: "Token expired or revoked." };
  const db = getDb()!;
  const ts = new Date(parsed.data.etaAt);
  await db
    .update(guestServiceFulfilments)
    .set({ etaAt: ts, updatedAt: new Date() })
    .where(eq(guestServiceFulfilments.id, ctx.fulfilmentId));
  await appendEvent(db, ctx.fulfilmentId, {
    eventType: "eta_updated",
    actorType: "vendor",
    vendorId: ctx.vendorId,
    title: `ETA ${ts.toISOString()}`,
  });
  return { ok: true };
}

export async function vendorMarkInProgressAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = vendorMarkSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { ok: false, error: "Invalid token." };
  const ctx = await fulfilmentFromToken(parsed.data.token);
  if (!ctx) return { ok: false, error: "Token expired or revoked." };
  const db = getDb()!;
  const ts = new Date();
  await db
    .update(guestServiceFulfilments)
    .set({ status: "in_progress", startedAt: ts, updatedAt: ts })
    .where(eq(guestServiceFulfilments.id, ctx.fulfilmentId));
  await appendEvent(db, ctx.fulfilmentId, {
    eventType: "started",
    actorType: "vendor",
    vendorId: ctx.vendorId,
    title: "Vendor started",
  });
  return { ok: true };
}

export async function vendorMarkCompletedAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = vendorMarkSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { ok: false, error: "Invalid token." };
  const ctx = await fulfilmentFromToken(parsed.data.token);
  if (!ctx) return { ok: false, error: "Token expired or revoked." };
  const db = getDb()!;
  const ts = new Date();
  await db
    .update(guestServiceFulfilments)
    .set({ status: "completed", completedAt: ts, updatedAt: ts })
    .where(eq(guestServiceFulfilments.id, ctx.fulfilmentId));
  await appendEvent(db, ctx.fulfilmentId, {
    eventType: "completed",
    actorType: "vendor",
    vendorId: ctx.vendorId,
    title: "Vendor reported completion",
  });
  const [info] = await db
    .select({
      stayTokenId: guestServiceOrders.guestStayTokenId,
      serviceName: guestServices.name,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(eq(guestServiceFulfilments.id, ctx.fulfilmentId))
    .limit(1);
  if (info) {
    await notifyFulfilmentCompleted({
      fulfilmentId: ctx.fulfilmentId,
      stayTokenId: info.stayTokenId,
      serviceName: info.serviceName ?? "service",
    });
  }
  return { ok: true };
}

export async function vendorDeclineFulfilmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = vendorDeclineSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const ctx = await fulfilmentFromToken(parsed.data.token);
  if (!ctx) return { ok: false, error: "Token expired or revoked." };
  const db = getDb()!;
  const ts = new Date();
  await db
    .update(guestServiceFulfilments)
    .set({
      status: "failed",
      cancellationReason: parsed.data.reason ?? "vendor_declined",
      updatedAt: ts,
    })
    .where(eq(guestServiceFulfilments.id, ctx.fulfilmentId));
  await appendEvent(db, ctx.fulfilmentId, {
    eventType: "failed",
    actorType: "vendor",
    vendorId: ctx.vendorId,
    title: "Vendor declined",
    description: parsed.data.reason ?? null,
  });
  return { ok: true };
}

// =============================================================================
// INVOICES
// =============================================================================

export async function createVendorInvoiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requirePermission("service_invoice.write");
  const parsed = createVendorInvoiceSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const v = parsed.data;
  const [row] = await db
    .insert(serviceVendorInvoices)
    .values({
      fulfilmentId: v.fulfilmentId,
      vendorId: v.vendorId,
      invoiceNumber: v.invoiceNumber ?? null,
      invoiceStatus: "received",
      amountMinor: BigInt(v.amountMinor),
      currency: v.currency,
      invoiceDate: v.invoiceDate ?? null,
      dueDate: v.dueDate ?? null,
      notes: v.notes ?? null,
    })
    .returning({ id: serviceVendorInvoices.id });
  if (!row) return { ok: false, error: "Insert failed." };
  await appendEvent(db, v.fulfilmentId, {
    eventType: "invoice_received",
    actorType: "admin",
    actorAppUserId: me?.id ?? null,
    vendorId: v.vendorId,
    title: `Invoice received${v.invoiceNumber ? ` · ${v.invoiceNumber}` : ""}`,
    metadataJson: { amountMinor: v.amountMinor, currency: v.currency },
  });
  const [vendor] = await db
    .select({ name: serviceVendors.displayName })
    .from(serviceVendors)
    .where(eq(serviceVendors.id, v.vendorId))
    .limit(1);
  await notifyVendorInvoiceReceived({
    invoiceId: row.id,
    fulfilmentCode: await fulfilmentCodeOf(db, v.fulfilmentId),
    vendorName: vendor?.name ?? "vendor",
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_vendor_invoice.create",
    entityType: "service_vendor_invoice",
    entityId: row.id,
    after: { fulfilmentId: v.fulfilmentId, amountMinor: v.amountMinor },
  });
  revalidatePath("/dashboard/service-fulfilment/invoices");
  return { ok: true, id: row.id };
}

async function setInvoiceStatus(
  id: string,
  status: "approved" | "rejected" | "paid",
): Promise<ActionResult> {
  await requirePermission("service_invoice.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const ts = new Date();
  const updates: Record<string, unknown> = {
    invoiceStatus: status,
    updatedAt: ts,
  };
  if (status === "approved") {
    updates.approvedBy = me?.id ?? null;
    updates.approvedAt = ts;
  }
  if (status === "paid") updates.paidAt = ts;
  await db
    .update(serviceVendorInvoices)
    .set(updates)
    .where(eq(serviceVendorInvoices.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `service_vendor_invoice.${status}`,
    entityType: "service_vendor_invoice",
    entityId: id,
  });
  revalidatePath("/dashboard/service-fulfilment/invoices");
  return { ok: true };
}

export async function approveVendorInvoiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = invoiceIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setInvoiceStatus(parsed.data.id, "approved");
}

export async function rejectVendorInvoiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = invoiceIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setInvoiceStatus(parsed.data.id, "rejected");
}

export async function markVendorInvoicePaidAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = invoiceIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return setInvoiceStatus(parsed.data.id, "paid");
}

// =============================================================================
// RATINGS
// =============================================================================

export async function submitGuestServiceRatingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Guest action — token gate happens in the calling page.
  const parsed = submitGuestServiceRatingSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const v = parsed.data;
  const [pair] = await db
    .select({
      f: guestServiceFulfilments,
      orderTokenId: guestServiceOrders.guestStayTokenId,
      bookingId: guestServiceOrders.bookingId,
      orderId: guestServiceOrders.id,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .where(eq(guestServiceFulfilments.id, v.fulfilmentId))
    .limit(1);
  if (!pair) return { ok: false, error: "Fulfilment not found." };
  if (pair.orderTokenId !== v.stayTokenId) {
    return { ok: false, error: "Token mismatch." };
  }
  if (pair.f.status !== "completed") {
    return { ok: false, error: "Service is not completed yet." };
  }

  const [existing] = await db
    .select()
    .from(guestServiceRatings)
    .where(
      and(
        eq(guestServiceRatings.fulfilmentId, v.fulfilmentId),
        eq(guestServiceRatings.stayTokenId, v.stayTokenId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(guestServiceRatings)
      .set({
        rating: v.rating,
        comment: v.comment ?? null,
        sentiment: v.sentiment ?? null,
        updatedAt: new Date(),
      })
      .where(eq(guestServiceRatings.id, existing.id));
  } else {
    await db.insert(guestServiceRatings).values({
      orderId: pair.orderId,
      fulfilmentId: v.fulfilmentId,
      bookingId: pair.bookingId ?? null,
      stayTokenId: v.stayTokenId,
      vendorId: pair.f.vendorId ?? null,
      rating: v.rating,
      comment: v.comment ?? null,
      sentiment: v.sentiment ?? null,
      status: "published",
    });
  }

  // Recompute vendor rating average (best-effort).
  if (pair.f.vendorId) {
    const rows = await db
      .select({ rating: guestServiceRatings.rating })
      .from(guestServiceRatings)
      .where(
        and(
          eq(guestServiceRatings.vendorId, pair.f.vendorId),
          eq(guestServiceRatings.status, "published"),
        ),
      );
    if (rows.length > 0) {
      const avg =
        rows.reduce((a, r) => a + r.rating, 0) / rows.length;
      await db
        .update(serviceVendors)
        .set({
          ratingAverage: avg.toFixed(2),
          ratingCount: rows.length,
          updatedAt: new Date(),
        })
        .where(eq(serviceVendors.id, pair.f.vendorId));
    }
  }
  await appendEvent(db, v.fulfilmentId, {
    eventType: "rating_received",
    actorType: "guest",
    title: `Rating: ${v.rating} / 5`,
    description: v.comment ?? null,
  });
  return { ok: true };
}

export async function hideGuestServiceRatingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_rating.manage");
  const parsed = ratingIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(guestServiceRatings)
    .set({ status: "hidden", updatedAt: new Date() })
    .where(eq(guestServiceRatings.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_rating.hide",
    entityType: "guest_service_rating",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/service-fulfilment/ratings");
  return { ok: true };
}

export async function flagGuestServiceRatingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_rating.manage");
  const parsed = flagRatingSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(guestServiceRatings)
    .set({ status: "flagged", updatedAt: new Date() })
    .where(eq(guestServiceRatings.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_rating.flag",
    entityType: "guest_service_rating",
    entityId: parsed.data.id,
    after: { reason: parsed.data.reason ?? null },
  });
  return { ok: true };
}

// =============================================================================
// FINANCE BRIDGE
// =============================================================================

export async function bridgeFulfilmentToFinanceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { status?: string }> {
  await requirePermission("service_fulfilment.finance_bridge");
  const parsed = bridgeFulfilmentSchema.safeParse({
    fulfilmentId: formData.get("fulfilmentId"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const out = await bridgeFulfilmentToFinance(
    parsed.data.fulfilmentId,
    me?.id ?? null,
    await requireOrgId(),
  );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_fulfilment.finance_bridge",
    entityType: "guest_service_fulfilment",
    entityId: parsed.data.fulfilmentId,
    after: { status: out.status },
  });
  revalidatePath(
    `/dashboard/service-fulfilment/fulfilments/${parsed.data.fulfilmentId}`,
  );
  revalidatePath("/dashboard/service-fulfilment/finance-bridge");
  return out.ok
    ? { ok: true, status: out.status }
    : { ok: false, error: out.reason };
}

export async function bridgePendingFulfilmentsToFinanceAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<
  ActionResult & {
    processed?: number;
    bridged?: number;
    skipped?: number;
    failed?: number;
  }
> {
  await requirePermission("service_fulfilment.finance_bridge");
  const me = await getCurrentAppUser();
  const out = await bridgePendingFulfilmentsToFinance(
    50,
    me?.id ?? null,
    await requireOrgId(),
  );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_fulfilment.finance_bridge.bulk",
    entityType: "guest_service_fulfilment",
    entityId: null,
    after: out,
  });
  revalidatePath("/dashboard/service-fulfilment/finance-bridge");
  return { ok: true, ...out };
}

export async function reverseFulfilmentFinanceBridgeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_fulfilment.finance_bridge");
  const parsed = reverseBridgeSchema.safeParse({
    fulfilmentId: formData.get("fulfilmentId"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const out = await reverseFulfilmentFinanceBridge(
    parsed.data.fulfilmentId,
    parsed.data.reason ?? "manual_reversal",
    me?.id ?? null,
  );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_fulfilment.finance_bridge.reverse",
    entityType: "guest_service_fulfilment",
    entityId: parsed.data.fulfilmentId,
    after: { reason: parsed.data.reason ?? null },
  });
  revalidatePath(
    `/dashboard/service-fulfilment/fulfilments/${parsed.data.fulfilmentId}`,
  );
  return out.ok ? { ok: true } : { ok: false, error: out.reason };
}

// =============================================================================
// helpers
// =============================================================================

interface AppendEventInput {
  eventType: string;
  actorType?: "system" | "admin" | "vendor" | "guest";
  actorAppUserId?: string | null;
  vendorId?: string | null;
  title: string;
  description?: string | null;
  metadataJson?: Record<string, unknown>;
}

async function appendEvent(
  db: NonNullable<ReturnType<typeof getDb>>,
  fulfilmentId: string,
  args: AppendEventInput,
): Promise<void> {
  await db.insert(serviceFulfilmentEvents).values({
    fulfilmentId,
    eventType: args.eventType,
    actorType: args.actorType ?? "system",
    actorAppUserId: args.actorAppUserId ?? null,
    vendorId: args.vendorId ?? null,
    title: args.title,
    description: args.description ?? null,
    metadataJson: args.metadataJson ?? null,
  });
}

async function fulfilmentCodeOf(
  db: NonNullable<ReturnType<typeof getDb>>,
  fulfilmentId: string,
): Promise<string> {
  const [row] = await db
    .select({ code: guestServiceFulfilments.fulfilmentCode })
    .from(guestServiceFulfilments)
    .where(eq(guestServiceFulfilments.id, fulfilmentId))
    .limit(1);
  return row?.code ?? "(unknown)";
}

async function pickUniqueFulfilmentCode(
  db: NonNullable<ReturnType<typeof getDb>>,
): Promise<string> {
  const today = todayUtcIsoDate();
  for (let i = 0; i < 10; i++) {
    const [{ count = 0 } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(guestServiceFulfilments)
      .where(sql`${guestServiceFulfilments.fulfilmentCode} LIKE ${"FUL-" + today.replaceAll("-", "") + "-%"}`);
    const candidate = buildFulfilmentCode({
      date: today,
      sequence: count + 1 + i,
    });
    const [existing] = await db
      .select({ id: guestServiceFulfilments.id })
      .from(guestServiceFulfilments)
      .where(eq(guestServiceFulfilments.fulfilmentCode, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  // Fallback: append a random suffix.
  return `FUL-${today.replaceAll("-", "")}-${randomFulfilmentSuffix()}`;
}
