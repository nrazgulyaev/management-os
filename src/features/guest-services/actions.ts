"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestServiceCategories,
  guestServiceOptions,
  guestServiceOrderEvents,
  guestServiceOrders,
  guestServices,
  type GuestServiceOrder,
} from "@/lib/db/schema/guest-services";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { getStayByToken } from "@/features/guest-stays/services";
import { recordStayAccessEvent } from "@/features/guest-stays/access-log";
import type { ActionResult } from "@/features/projects/actions";

import {
  addOrderNoteSchema,
  bridgeOrderToFinanceSchema,
  submitGuestOrderSchema,
  transitionOrderSchema,
  upsertCategorySchema,
  upsertServiceOptionSchema,
  upsertServiceSchema,
} from "./schema";
import {
  nextGuestServiceOrderCounter,
} from "./services";
import { buildGuestServiceOrderCode } from "./codes";
import {
  canTransition,
  shouldFinanceBridge,
  type OrderStatus,
} from "./status";
import { priceGuestService, type PricingModel } from "./pricing";
import { validateRequestedSlot } from "./availability";
import {
  notifyOrderCreated,
  notifyOrderTransitioned,
} from "./notifications";
import { bridgeOrderToFinance } from "./finance-bridge";

// =============================================================================
// Catalog management — admin
// =============================================================================

export async function upsertCategoryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requirePermission("guest_services.manage");
  const parsed = upsertCategorySchema.safeParse(
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
  const v = parsed.data;

  if (v.id) {
    await db
      .update(guestServiceCategories)
      .set({
        key: v.key,
        name: v.name,
        description: v.description ?? null,
        icon: v.icon ?? null,
        sortOrder: v.sortOrder,
        status: v.status,
        updatedAt: new Date(),
      })
      .where(eq(guestServiceCategories.id, v.id));
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "guest_services.category.update",
      entityType: "guest_service_category",
      entityId: v.id,
      after: v,
    });
    revalidatePath("/dashboard/guest-services/categories");
    return { ok: true, id: v.id };
  }

  const [row] = await db
    .insert(guestServiceCategories)
    .values({
      key: v.key,
      name: v.name,
      description: v.description ?? null,
      icon: v.icon ?? null,
      sortOrder: v.sortOrder,
      status: v.status,
    })
    .returning({ id: guestServiceCategories.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_services.category.create",
    entityType: "guest_service_category",
    entityId: row!.id,
    after: v,
  });
  revalidatePath("/dashboard/guest-services/categories");
  return { ok: true, id: row!.id };
}

export async function upsertServiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requirePermission("guest_services.write");
  const raw = Object.fromEntries(formData.entries());
  const parsed = upsertServiceSchema.safeParse(raw);
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

  const values = {
    categoryId: v.categoryId,
    projectId: v.projectId,
    villaId: v.villaId,
    serviceKey: v.serviceKey,
    name: v.name,
    shortDescription: v.shortDescription ?? null,
    descriptionMd: v.descriptionMd ?? null,
    imageUrl: v.imageUrl ?? null,
    serviceType: v.serviceType,
    pricingModel: v.pricingModel,
    basePriceMinor: v.basePriceMinor,
    internalCostMinor: v.internalCostMinor,
    currency: v.currency,
    requiresDate: v.requiresDate,
    requiresTime: v.requiresTime,
    requiresGuestCount: v.requiresGuestCount,
    requiresAdminConfirmation: v.requiresAdminConfirmation,
    allowMultipleDays: v.allowMultipleDays,
    minQuantity: v.minQuantity,
    maxQuantity: v.maxQuantity ?? null,
    leadTimeHours: v.leadTimeHours ?? null,
    cancellationPolicyMd: v.cancellationPolicyMd ?? null,
    guestVisible: v.guestVisible,
    status: v.status,
    sortOrder: v.sortOrder,
  };

  if (v.id) {
    await db
      .update(guestServices)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(guestServices.id, v.id));
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "guest_services.service.update",
      entityType: "guest_service",
      entityId: v.id,
      after: { ...values, basePriceMinor: values.basePriceMinor.toString() },
    });
    revalidatePath("/dashboard/guest-services/catalog");
    revalidatePath(`/dashboard/guest-services/catalog/${v.id}`);
    return { ok: true, id: v.id };
  }

  const organizationId = await requireOrgId();
  const [row] = await db
    .insert(guestServices)
    .values({ ...values, organizationId, createdBy: me?.id ?? null })
    .returning({ id: guestServices.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_services.service.create",
    entityType: "guest_service",
    entityId: row!.id,
    after: { ...values, basePriceMinor: values.basePriceMinor.toString() },
  });
  revalidatePath("/dashboard/guest-services/catalog");
  return { ok: true, id: row!.id };
}

export async function upsertServiceOptionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requirePermission("guest_services.write");
  const parsed = upsertServiceOptionSchema.safeParse(
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
  const v = parsed.data;

  const values = {
    serviceId: v.serviceId,
    optionKey: v.optionKey,
    label: v.label,
    description: v.description ?? null,
    priceDeltaMinor: v.priceDeltaMinor,
    internalCostDeltaMinor: v.internalCostDeltaMinor,
    isDefault: v.isDefault,
    sortOrder: v.sortOrder,
    status: v.status,
  };

  if (v.id) {
    await db
      .update(guestServiceOptions)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(guestServiceOptions.id, v.id));
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "guest_services.option.update",
      entityType: "guest_service_option",
      entityId: v.id,
      after: { ...values, priceDeltaMinor: values.priceDeltaMinor.toString() },
    });
    revalidatePath(`/dashboard/guest-services/catalog/${v.serviceId}`);
    return { ok: true, id: v.id };
  }

  const [row] = await db
    .insert(guestServiceOptions)
    .values(values)
    .returning({ id: guestServiceOptions.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_services.option.create",
    entityType: "guest_service_option",
    entityId: row!.id,
    after: { ...values, priceDeltaMinor: values.priceDeltaMinor.toString() },
  });
  revalidatePath(`/dashboard/guest-services/catalog/${v.serviceId}`);
  return { ok: true, id: row!.id };
}

// =============================================================================
// Guest order submission — token-gated, no admin permission required
// =============================================================================

export async function submitGuestOrderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { orderCode?: string }> {
  const parsed = submitGuestOrderSchema.safeParse({
    token: formData.get("token"),
    serviceId: formData.get("serviceId"),
    selectedOptionId: formData.get("selectedOptionId") || null,
    requestedDate: formData.get("requestedDate") || null,
    requestedTime: formData.get("requestedTime") || null,
    quantity: formData.get("quantity") ?? 1,
    guestCount: formData.get("guestCount") || null,
    guestNote: formData.get("guestNote") || null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const v = parsed.data;

  const resolved = await getStayByToken(v.token);
  if (!resolved.ok) {
    await recordStayAccessEvent({
      eventType:
        resolved.reason === "expired"
          ? "expired_token"
          : resolved.reason === "revoked"
            ? "revoked_token"
            : "invalid_token",
    });
    return { ok: false, error: "We couldn't verify your stay link." };
  }
  const stay = resolved.stay;

  const db = getDb();
  if (!db) return { ok: false, error: "Service is temporarily unavailable." };

  // Look up the catalog row to validate scope + recompute price.
  const [service] = await db
    .select()
    .from(guestServices)
    .where(eq(guestServices.id, v.serviceId))
    .limit(1);
  if (!service || service.status !== "active" || !service.guestVisible) {
    return { ok: false, error: "This service is no longer available." };
  }
  // Guard scope: villa-scoped row must match the stay's villa; project
  // row must match the stay's project; global rows are always allowed.
  if (service.villaId && service.villaId !== stay.villaId) {
    return { ok: false, error: "This service is not available for your villa." };
  }
  if (
    !service.villaId &&
    service.projectId &&
    service.projectId !== stay.projectId
  ) {
    return {
      ok: false,
      error: "This service is not available for your villa.",
    };
  }

  let option: typeof guestServiceOptions.$inferSelect | null = null;
  if (v.selectedOptionId) {
    const [o] = await db
      .select()
      .from(guestServiceOptions)
      .where(eq(guestServiceOptions.id, v.selectedOptionId))
      .limit(1);
    if (!o || o.serviceId !== service.id || o.status !== "active") {
      return { ok: false, error: "Selected option is unavailable." };
    }
    option = o;
  }

  // Validate slot.
  const issues = validateRequestedSlot({
    pricingModel: service.pricingModel as PricingModel,
    requiresDate: service.requiresDate,
    minQuantity: service.minQuantity,
    maxQuantity: service.maxQuantity,
    leadTimeHours: service.leadTimeHours,
    requestedDate: v.requestedDate ?? null,
    requestedTime: v.requestedTime ?? null,
    quantity: v.quantity,
    guestCount: v.guestCount ?? null,
    stayCheckIn: stay.checkIn,
    stayCheckOut: stay.checkOut,
  });
  if (issues.length > 0) {
    return {
      ok: false,
      error: friendlySlotIssue(issues[0]),
    };
  }

  // Recompute price server-side.
  const priced = priceGuestService({
    pricingModel: service.pricingModel as PricingModel,
    basePriceMinor: service.basePriceMinor,
    internalCostMinor: service.internalCostMinor ?? null,
    optionPriceDeltaMinor: option?.priceDeltaMinor ?? 0n,
    optionInternalCostDeltaMinor: option?.internalCostDeltaMinor ?? null,
    quantity: v.quantity,
    guestCount: v.guestCount ?? null,
    hours: null,
  });

  const counter = await nextGuestServiceOrderCounter();
  const orderCode = buildGuestServiceOrderCode(counter);

  let requestedStartAt: Date | null = null;
  let requestedEndAt: Date | null = null;
  if (v.requestedDate) {
    const time = v.requestedTime ?? "12:00";
    const start = new Date(`${v.requestedDate}T${time}:00.000Z`);
    requestedStartAt = start;
    requestedEndAt = service.allowMultipleDays
      ? new Date(start.getTime() + v.quantity * 24 * 60 * 60 * 1000)
      : new Date(start.getTime() + 60 * 60 * 1000);
  }

  const [row] = await db
    .insert(guestServiceOrders)
    .values({
      orderCode,
      guestStayTokenId: stay.tokenId,
      bookingId: stay.bookingId,
      guestId: null,
      villaId: stay.villaId,
      projectId: stay.projectId,
      serviceId: service.id,
      selectedOptionId: option?.id ?? null,
      requestedDate: v.requestedDate ?? null,
      requestedTime: v.requestedTime ?? null,
      requestedStartAt,
      requestedEndAt,
      quantity: v.quantity,
      guestCount: v.guestCount ?? null,
      guestNote: v.guestNote ?? null,
      status: "requested",
      guestPriceMinor: priced.guestPriceMinor,
      internalCostMinor: priced.internalCostMinor,
      marginMinor: priced.marginMinor,
      currency: service.currency,
      requiresAdminConfirmation: service.requiresAdminConfirmation,
    })
    .returning({ id: guestServiceOrders.id });

  await db.insert(guestServiceOrderEvents).values({
    orderId: row!.id,
    eventType: "created",
    actorType: "guest",
    actorAppUserId: null,
    message: v.guestNote ?? null,
    metadata: {
      orderCode,
      serviceId: service.id,
      pricingModel: service.pricingModel,
      quoteRequired: priced.quoteRequired,
    },
  });

  await recordStayAccessEvent({
    guestStayTokenId: stay.tokenId,
    bookingId: stay.bookingId,
    eventType: "service_request_created",
    metadata: {
      orderCode,
      serviceId: service.id,
      orderId: row!.id,
    },
  });

  await recordAuditEvent({
    actorUserId: null,
    action: "guest_services.order.create",
    entityType: "guest_service_order",
    entityId: row!.id,
    after: {
      orderCode,
      bookingId: stay.bookingId,
      serviceId: service.id,
      guestPriceMinor: priced.guestPriceMinor.toString(),
      currency: service.currency,
    },
  });

  await notifyOrderCreated({
    id: row!.id,
    orderCode,
    organizationId: service.organizationId,
    bookingId: stay.bookingId,
    villaCode: stay.villaCode,
    serviceName: service.name,
  });

  revalidatePath("/dashboard/guest-services/orders");
  return { ok: true, orderCode };
}

function friendlySlotIssue(issue: string): string {
  switch (issue) {
    case "missing_date":
      return "Please choose a date for this service.";
    case "date_outside_stay":
      return "The chosen date is outside your stay window.";
    case "lead_time_violation":
      return "This service needs more lead time. Try a later slot.";
    case "quantity_below_min":
      return "Quantity is below the minimum for this service.";
    case "quantity_above_max":
      return "Quantity exceeds the maximum for this service.";
    case "missing_guest_count":
      return "Please tell us how many people this is for.";
    default:
      return "Please review your request and try again.";
  }
}

// =============================================================================
// Admin lifecycle
// =============================================================================

export async function transitionOrderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("guest_service_orders.write");
  const parsed = transitionOrderSchema.safeParse({
    id: formData.get("id"),
    to: formData.get("to"),
    message: formData.get("message") || null,
    assignedTo: formData.get("assignedTo") || null,
    internalNote: formData.get("internalNote") || null,
    guestPriceMinorOverride:
      formData.get("guestPriceMinorOverride") || null,
    internalCostMinorOverride:
      formData.get("internalCostMinorOverride") || null,
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
  const organizationId = await requireOrgId();
  const v = parsed.data;

  // Tenancy guard: the order has no org column, but its catalog row
  // (guest_services.organization_id NOT NULL) does. Join + filter so a
  // cross-org order id reads as "not found".
  const [orderRow] = await db
    .select({ order: guestServiceOrders })
    .from(guestServiceOrders)
    .innerJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(
      and(
        eq(guestServiceOrders.id, v.id),
        eq(guestServices.organizationId, organizationId),
      ),
    )
    .limit(1);
  const order = orderRow?.order;
  if (!order) return { ok: false, error: "Order not found." };

  const from = order.status as OrderStatus;
  const to = v.to as OrderStatus;
  if (!canTransition(from, to)) {
    return {
      ok: false,
      error: `Cannot transition from ${from} to ${to}.`,
    };
  }
  if (to === "fulfilled") {
    await requirePermission("guest_service_orders.fulfill");
  }

  const now = new Date();
  const updates: Partial<GuestServiceOrder> = {
    status: to,
    updatedAt: now,
  };
  if (v.assignedTo !== undefined && v.assignedTo !== null) {
    updates.assignedTo = v.assignedTo;
  }
  if (v.internalNote) updates.internalNote = v.internalNote;
  if (
    v.guestPriceMinorOverride !== null &&
    v.guestPriceMinorOverride !== undefined
  ) {
    updates.guestPriceMinor = v.guestPriceMinorOverride;
  }
  if (
    v.internalCostMinorOverride !== null &&
    v.internalCostMinorOverride !== undefined
  ) {
    updates.internalCostMinor = v.internalCostMinorOverride;
  }
  if (
    updates.guestPriceMinor !== undefined ||
    updates.internalCostMinor !== undefined
  ) {
    const guest = updates.guestPriceMinor ?? order.guestPriceMinor;
    const internal =
      updates.internalCostMinor ?? order.internalCostMinor ?? null;
    updates.marginMinor =
      internal === null ? null : (guest as bigint) - (internal as bigint);
  }
  if (to === "confirmed" && !order.confirmedAt) updates.confirmedAt = now;
  if (to === "fulfilled" && !order.fulfilledAt) updates.fulfilledAt = now;
  if (
    (to === "cancelled" || to === "rejected") &&
    !order.cancelledAt
  ) {
    updates.cancelledAt = now;
  }

  await db
    .update(guestServiceOrders)
    .set(updates)
    .where(eq(guestServiceOrders.id, v.id));

  await db.insert(guestServiceOrderEvents).values({
    orderId: v.id,
    eventType: to,
    actorType: me?.id ? "staff" : "system",
    actorAppUserId: me?.id ?? null,
    message: v.message ?? null,
    metadata: {
      from,
      to,
      assignedTo: v.assignedTo ?? null,
    },
  });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `guest_services.order.${to}`,
    entityType: "guest_service_order",
    entityId: v.id,
    before: { status: from },
    after: { status: to, assignedTo: v.assignedTo ?? null },
  });

  // Service-name lookup (for the notification body).
  const [serviceRow] = await db
    .select({
      name: guestServices.name,
      organizationId: guestServices.organizationId,
    })
    .from(guestServices)
    .where(eq(guestServices.id, order.serviceId))
    .limit(1);

  await notifyOrderTransitioned({
    order: {
      id: v.id,
      orderCode: order.orderCode,
      organizationId: serviceRow?.organizationId ?? null,
      bookingId: order.bookingId,
      villaCode: null,
      serviceName: serviceRow?.name ?? null,
    },
    to,
  });

  // Auto-bridge on fulfilment if guest_services_orders.finance_bridge perm holder.
  if (shouldFinanceBridge(from, to)) {
    try {
      await bridgeOrderToFinance(v.id, me?.id ?? null, "auto on fulfilment");
    } catch {
      // Don't fail the transition if bridge fails — admin can retry.
    }
  }

  revalidatePath("/dashboard/guest-services/orders");
  revalidatePath(`/dashboard/guest-services/orders/${v.id}`);
  if (order.bookingId) {
    revalidatePath(`/dashboard/bookings/${order.bookingId}/guest-stay`);
  }
  return { ok: true };
}

export async function addOrderNoteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("guest_service_orders.write");
  const parsed = addOrderNoteSchema.safeParse({
    id: formData.get("id"),
    message: formData.get("message"),
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
  const organizationId = await requireOrgId();

  // Tenancy guard: confirm the order belongs to the caller's org (via its
  // catalog row) before appending a note to its timeline.
  const [scoped] = await db
    .select({ id: guestServiceOrders.id })
    .from(guestServiceOrders)
    .innerJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(
      and(
        eq(guestServiceOrders.id, parsed.data.id),
        eq(guestServices.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!scoped) return { ok: false, error: "Order not found." };

  await db.insert(guestServiceOrderEvents).values({
    orderId: parsed.data.id,
    eventType: "note_added",
    actorType: me?.id ? "staff" : "system",
    actorAppUserId: me?.id ?? null,
    message: parsed.data.message,
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_services.order.note",
    entityType: "guest_service_order",
    entityId: parsed.data.id,
    after: { message: parsed.data.message },
  });
  revalidatePath(`/dashboard/guest-services/orders/${parsed.data.id}`);
  return { ok: true };
}

export async function bridgeOrderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("guest_service_orders.finance_bridge");
  const parsed = bridgeOrderToFinanceSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason") || null,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Tenancy guard: this action mints a revenue_line (live money) for the
  // order. Confirm the order belongs to the caller's org (via its catalog
  // row) before bridging — never bridge another tenant's order.
  const [scoped] = await db
    .select({ id: guestServiceOrders.id })
    .from(guestServiceOrders)
    .innerJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .where(
      and(
        eq(guestServiceOrders.id, parsed.data.id),
        eq(guestServices.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!scoped) return { ok: false, error: "Order not found." };

  const out = await bridgeOrderToFinance(
    parsed.data.id,
    me?.id ?? null,
    parsed.data.reason ?? null,
  );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest_services.order.bridge",
    entityType: "guest_service_order",
    entityId: parsed.data.id,
    after: { outcome: out },
  });
  revalidatePath("/dashboard/guest-services/finance-bridge");
  revalidatePath(`/dashboard/guest-services/orders/${parsed.data.id}`);
  if (!out.ok) return { ok: false, error: out.reason };
  return { ok: true };
}
