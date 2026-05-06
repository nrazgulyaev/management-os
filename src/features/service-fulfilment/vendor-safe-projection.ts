/**
 * Vendor-safe projection of a fulfilment row + its order context.
 * Pure module — every field that survives the projection has been
 * explicitly considered.
 *
 * What vendors NEVER see:
 *   - guest email / phone / nationality
 *   - owner identity, finance, statements, margin
 *   - other bookings on the villa
 *   - lock codes, Wi-Fi, token hashes, storage paths, camera URLs
 *   - internal notes, internal status reasons
 *   - other vendors' quotes
 *
 * What vendors DO see:
 *   - the fulfilment code (so they can paste it into our reply form)
 *   - service name + selected option label
 *   - schedule + ETA
 *   - villa label + service area (city / district)
 *   - guest count
 *   - first-name-only or masked guest label
 *   - guest phone ONLY when `allowGuestContact` is explicitly true on
 *     the projection input (admin opts in per fulfilment, never on by
 *     default)
 */
import {
  vendorFacingFulfilmentStatus,
  type FulfilmentStatus,
} from "./status-pure";
import { maskGuestName } from "@/features/owner-intelligence/calendar-pure";

export interface VendorSafeFulfilmentInput {
  fulfilment: {
    id: string;
    fulfilmentCode: string;
    status: FulfilmentStatus;
    fulfilmentType: "internal" | "vendor" | "hybrid";
    scheduledFor: Date | null;
    etaAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    requiresGuestConfirmation: boolean;
    guestConfirmedAt: Date | null;
    vendorReference: string | null;
    vendorNotes: string | null;
    /** Internal cost/margin/guestPrice are NEVER returned to vendors. */
  };
  order: {
    quantity: number | null;
    selectedOptionLabel: string | null;
    requestedDate: string | null;
    requestedTime: string | null;
    guestNote: string | null;
  };
  service: {
    name: string;
    serviceType: string | null;
  };
  villa: {
    label: string | null;
    serviceArea: string | null;
  };
  guest: {
    fullName: string | null;
    phone: string | null;
    /** When false (default) we drop the phone. */
    allowGuestContact?: boolean;
  };
}

export interface VendorSafeFulfilmentView {
  fulfilmentCode: string;
  service: { name: string; type: string | null };
  status: { label: string; tone: string; awaitingVendor: boolean };
  schedule: {
    requestedDate: string | null;
    requestedTime: string | null;
    scheduledFor: string | null;
    etaAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
  villa: { label: string | null; area: string | null };
  guest: {
    label: string;
    quantity: number | null;
    note: string | null;
    phone: string | null;
  };
  options: { selected: string | null };
  vendor: {
    reference: string | null;
    notes: string | null;
    confirmationRequired: boolean;
    guestConfirmed: boolean;
  };
}

export function buildVendorSafeFulfilmentView(
  input: VendorSafeFulfilmentInput,
): VendorSafeFulfilmentView {
  const status = vendorFacingFulfilmentStatus(input.fulfilment.status);
  return {
    fulfilmentCode: input.fulfilment.fulfilmentCode,
    service: {
      name: input.service.name,
      type: input.service.serviceType,
    },
    status: {
      label: status.label,
      tone: status.tone,
      awaitingVendor: status.awaitingVendor,
    },
    schedule: {
      requestedDate: input.order.requestedDate,
      requestedTime: input.order.requestedTime,
      scheduledFor: input.fulfilment.scheduledFor?.toISOString() ?? null,
      etaAt: input.fulfilment.etaAt?.toISOString() ?? null,
      startedAt: input.fulfilment.startedAt?.toISOString() ?? null,
      completedAt: input.fulfilment.completedAt?.toISOString() ?? null,
    },
    villa: {
      label: input.villa.label,
      area: input.villa.serviceArea,
    },
    guest: {
      label: maskGuestName(input.guest.fullName),
      quantity: input.order.quantity,
      note: input.order.guestNote,
      phone: input.guest.allowGuestContact ? input.guest.phone : null,
    },
    options: {
      selected: input.order.selectedOptionLabel,
    },
    vendor: {
      reference: input.fulfilment.vendorReference,
      notes: input.fulfilment.vendorNotes,
      confirmationRequired: input.fulfilment.requiresGuestConfirmation,
      guestConfirmed: input.fulfilment.guestConfirmedAt !== null,
    },
  };
}
