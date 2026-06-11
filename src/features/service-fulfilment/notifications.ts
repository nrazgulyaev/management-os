import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestServiceFulfilments,
  serviceVendorInvoices,
} from "@/lib/db/schema/service-fulfilment";
import { queueNotification } from "@/features/notifications/services";

/**
 * Thin wrappers over `queueNotification` for the service-fulfilment
 * domain. Every call uses a stable `dedupeKey` so re-firing actions
 * (or retries) never double-queue.
 *
 * Recipient mode:
 *   - Internal (concierge / property_manager / finance_manager) →
 *     recipientType="role" with roleKey passed via `payload.role`
 *   - Guest → recipientType="guest" with the stay_token_id
 *
 * The dispatch worker maps `role` recipients to the actual user
 * inboxes via existing notification preferences.
 */

interface InternalNotifyArgs {
  templateKey: string;
  title: string;
  body: string;
  dedupeKey: string;
  organizationId?: string | null;
  payload?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
}

/** Org anchor — guest_service_fulfilments.organization_id (nullable, 0153). */
async function orgForFulfilment(
  fulfilmentId: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ organizationId: guestServiceFulfilments.organizationId })
    .from(guestServiceFulfilments)
    .where(eq(guestServiceFulfilments.id, fulfilmentId))
    .limit(1);
  return row?.organizationId ?? null;
}

/** Org anchor — service_vendor_invoices.organization_id (nullable, 0153). */
async function orgForVendorInvoice(
  invoiceId: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ organizationId: serviceVendorInvoices.organizationId })
    .from(serviceVendorInvoices)
    .where(eq(serviceVendorInvoices.id, invoiceId))
    .limit(1);
  return row?.organizationId ?? null;
}

async function notifyInternalRole(
  role:
    | "concierge"
    | "property_manager"
    | "operations_manager"
    | "finance_manager",
  args: InternalNotifyArgs,
): Promise<void> {
  await queueNotification({
    recipientType: "role",
    organizationId: args.organizationId ?? undefined,
    channel: "in_app",
    templateKey: args.templateKey,
    title: args.title,
    body: args.body,
    dedupeKey: args.dedupeKey,
    payload: { ...(args.payload ?? {}), role },
    priority: args.priority ?? "normal",
  });
}

async function notifyGuestByToken(
  stayTokenId: string,
  args: InternalNotifyArgs,
): Promise<void> {
  await queueNotification({
    recipientType: "guest",
    recipientId: stayTokenId,
    organizationId: args.organizationId ?? undefined,
    channel: "in_app",
    templateKey: args.templateKey,
    title: args.title,
    body: args.body,
    dedupeKey: args.dedupeKey,
    payload: args.payload,
    priority: args.priority ?? "normal",
  });
}

// -----------------------------------------------------------------------------
// Specific events
// -----------------------------------------------------------------------------

export async function notifyFulfilmentCreated(args: {
  fulfilmentId: string;
  fulfilmentCode: string;
  serviceName: string;
}): Promise<void> {
  await notifyInternalRole("concierge", {
    templateKey: "service_fulfilment.order_received",
    title: `New service request — ${args.serviceName}`,
    body: `Triage required for ${args.fulfilmentCode}.`,
    dedupeKey: `svc-fulfilment-created:${args.fulfilmentId}`,
    organizationId: await orgForFulfilment(args.fulfilmentId),
    payload: { fulfilmentId: args.fulfilmentId },
  });
}

export async function notifyVendorAssigned(args: {
  fulfilmentId: string;
  fulfilmentCode: string;
  vendorName: string;
}): Promise<void> {
  await notifyInternalRole("property_manager", {
    templateKey: "service_fulfilment.vendor_assigned",
    title: `Vendor assigned — ${args.vendorName}`,
    body: `Fulfilment ${args.fulfilmentCode} routed to ${args.vendorName}.`,
    dedupeKey: `svc-fulfilment-assigned:${args.fulfilmentId}`,
    organizationId: await orgForFulfilment(args.fulfilmentId),
    payload: { fulfilmentId: args.fulfilmentId },
  });
}

export async function notifyVendorConfirmed(args: {
  fulfilmentId: string;
  fulfilmentCode: string;
  vendorName: string;
}): Promise<void> {
  await notifyInternalRole("concierge", {
    templateKey: "service_fulfilment.vendor_confirmed",
    title: `Vendor confirmed — ${args.vendorName}`,
    body: `${args.vendorName} accepted ${args.fulfilmentCode}.`,
    dedupeKey: `svc-fulfilment-vendor-confirmed:${args.fulfilmentId}`,
    organizationId: await orgForFulfilment(args.fulfilmentId),
    payload: { fulfilmentId: args.fulfilmentId },
  });
}

export async function notifyGuestConfirmationRequested(args: {
  fulfilmentId: string;
  stayTokenId: string;
  serviceName: string;
}): Promise<void> {
  await notifyGuestByToken(args.stayTokenId, {
    templateKey: "service_fulfilment.guest_confirmation_required",
    title: `Confirm your ${args.serviceName}`,
    body: "Open the stay portal to confirm or adjust the timing.",
    dedupeKey: `svc-fulfilment-guest-confirm:${args.fulfilmentId}`,
    organizationId: await orgForFulfilment(args.fulfilmentId),
    payload: { fulfilmentId: args.fulfilmentId },
  });
}

export async function notifyFulfilmentScheduled(args: {
  fulfilmentId: string;
  stayTokenId: string | null;
  serviceName: string;
  scheduledFor: Date | null;
}): Promise<void> {
  if (!args.stayTokenId) return;
  await notifyGuestByToken(args.stayTokenId, {
    templateKey: "service_fulfilment.scheduled",
    title: `${args.serviceName} scheduled`,
    body: args.scheduledFor
      ? `Scheduled for ${args.scheduledFor.toISOString()}.`
      : "Scheduled — see your stay portal for details.",
    dedupeKey: `svc-fulfilment-scheduled:${args.fulfilmentId}`,
    organizationId: await orgForFulfilment(args.fulfilmentId),
    payload: { fulfilmentId: args.fulfilmentId },
  });
}

export async function notifyFulfilmentEtaUpdated(args: {
  fulfilmentId: string;
  stayTokenId: string | null;
  serviceName: string;
  etaAt: Date;
}): Promise<void> {
  if (!args.stayTokenId) return;
  await notifyGuestByToken(args.stayTokenId, {
    templateKey: "service_fulfilment.eta_updated",
    title: `${args.serviceName} ETA updated`,
    body: `New ETA: ${args.etaAt.toISOString()}.`,
    dedupeKey: `svc-fulfilment-eta:${args.fulfilmentId}:${args.etaAt.toISOString().slice(0, 16)}`,
    organizationId: await orgForFulfilment(args.fulfilmentId),
    payload: { fulfilmentId: args.fulfilmentId },
  });
}

export async function notifyFulfilmentCompleted(args: {
  fulfilmentId: string;
  stayTokenId: string | null;
  serviceName: string;
}): Promise<void> {
  if (!args.stayTokenId) return;
  const organizationId = await orgForFulfilment(args.fulfilmentId);
  await notifyGuestByToken(args.stayTokenId, {
    templateKey: "service_fulfilment.completed",
    title: `${args.serviceName} completed`,
    body: "Hope it went well — leave a quick rating from your stay portal.",
    dedupeKey: `svc-fulfilment-completed:${args.fulfilmentId}`,
    organizationId,
    payload: { fulfilmentId: args.fulfilmentId },
  });
  await notifyGuestByToken(args.stayTokenId, {
    templateKey: "service_fulfilment.rating_requested",
    title: `Rate your ${args.serviceName}`,
    body: "Two seconds — pick a star count.",
    dedupeKey: `svc-fulfilment-rating-request:${args.fulfilmentId}`,
    organizationId,
    payload: { fulfilmentId: args.fulfilmentId },
  });
}

export async function notifyFulfilmentCancelled(args: {
  fulfilmentId: string;
  stayTokenId: string | null;
  serviceName: string;
}): Promise<void> {
  if (!args.stayTokenId) return;
  await notifyGuestByToken(args.stayTokenId, {
    templateKey: "service_fulfilment.cancelled",
    title: `${args.serviceName} cancelled`,
    body: "Sorry about that — open the stay portal for next steps.",
    dedupeKey: `svc-fulfilment-cancelled:${args.fulfilmentId}`,
    organizationId: await orgForFulfilment(args.fulfilmentId),
    payload: { fulfilmentId: args.fulfilmentId },
  });
}

export async function notifyVendorInvoiceReceived(args: {
  invoiceId: string;
  fulfilmentCode: string;
  vendorName: string;
}): Promise<void> {
  await notifyInternalRole("finance_manager", {
    templateKey: "service_fulfilment.vendor_invoice_received",
    title: `Vendor invoice — ${args.vendorName}`,
    body: `Invoice attached to fulfilment ${args.fulfilmentCode}.`,
    dedupeKey: `svc-vendor-invoice:${args.invoiceId}`,
    organizationId: await orgForVendorInvoice(args.invoiceId),
    payload: { invoiceId: args.invoiceId },
  });
}

export async function notifyFinanceBridgeFailed(args: {
  fulfilmentId: string;
  fulfilmentCode: string;
  reason: string;
}): Promise<void> {
  await notifyInternalRole("finance_manager", {
    templateKey: "service_fulfilment.vendor_invoice_received",
    title: `Finance bridge failed — ${args.fulfilmentCode}`,
    body: args.reason,
    dedupeKey: `svc-fulfilment-bridge-failed:${args.fulfilmentId}`,
    organizationId: await orgForFulfilment(args.fulfilmentId),
    payload: { fulfilmentId: args.fulfilmentId },
    priority: "high",
  });
}
