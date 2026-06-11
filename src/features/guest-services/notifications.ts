import "server-only";

import { queueNotification } from "@/features/notifications/services";
import type { OrderStatus } from "./status";

const TARGET_ROLES = ["concierge", "property_manager"] as const;

interface OrderForNotification {
  id: string;
  orderCode: string;
  /** Org anchor — derived from the order's catalog service (guest_services.organization_id). */
  organizationId: string | null;
  bookingId: string | null;
  villaCode: string | null;
  serviceName: string | null;
}

/**
 * Queue in-app notifications when a guest submits a new service order.
 * Best-effort — exceptions are swallowed so the action still returns
 * success to the guest.
 */
export async function notifyOrderCreated(
  order: OrderForNotification,
): Promise<void> {
  for (const role of TARGET_ROLES) {
    try {
      await queueNotification({
        recipientType: "role",
        organizationId: order.organizationId ?? undefined,
        channel: "in_app",
        templateKey: "guest_service_order.created",
        title: `New guest service · ${order.villaCode ?? "villa"}`,
        body: `${order.serviceName ?? "Service"} (${order.orderCode})`,
        payload: {
          recipientRole: role,
          orderId: order.id,
          orderCode: order.orderCode,
          bookingId: order.bookingId,
        },
        priority: "normal",
        dedupeKey: `gso_created:${order.id}:${role}`,
      });
    } catch {
      // Non-blocking.
    }
  }
}

/**
 * Notify on lifecycle transitions. We only fan out for the user-facing
 * milestones (`confirmed`, `scheduled`, `fulfilled`, `cancelled`,
 * `rejected`). `reviewing` is internal-only and stays quiet.
 */
export async function notifyOrderTransitioned(input: {
  order: OrderForNotification;
  to: OrderStatus;
}): Promise<void> {
  const { to, order } = input;
  if (to === "reviewing") return;

  for (const role of TARGET_ROLES) {
    try {
      await queueNotification({
        recipientType: "role",
        organizationId: order.organizationId ?? undefined,
        channel: "in_app",
        templateKey: `guest_service_order.${to}`,
        title: `Service ${to} · ${order.villaCode ?? "villa"}`,
        body: `${order.serviceName ?? "Service"} (${order.orderCode}) → ${to}`,
        payload: {
          recipientRole: role,
          orderId: order.id,
          orderCode: order.orderCode,
          bookingId: order.bookingId,
          status: to,
        },
        priority: to === "cancelled" || to === "rejected" ? "high" : "normal",
        dedupeKey: `gso_${to}:${order.id}:${role}`,
      });
    } catch {
      // Non-blocking.
    }
  }
}
