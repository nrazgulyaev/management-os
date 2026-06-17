"use server";

/**
 * UI action adapters for the permits cabinet. The underlying actions live in
 * a server-only (non-"use server") module, so a "use client" island cannot
 * import them directly — these thin wrappers route through. They add no auth
 * of their own; createPermit / transitionPermitStatus / attachPermitDocument
 * each enforce requireInternalUser + requireOrgId and revalidate.
 */

import { revalidatePath } from "next/cache";
import {
  createPermit,
  transitionPermitStatus,
  attachPermitDocument,
} from "@/lib/development/server/permits/permit-actions";

type PermitType =
  | "pbg"
  | "slf"
  | "building_license"
  | "environmental"
  | "zoning_change"
  | "business_license"
  | "construction_permit"
  | "utility_connection"
  | "land_use_change"
  | "custom";

type PermitStatus =
  | "planned"
  | "preparing"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired"
  | "renewed"
  | "cancelled";

export async function createPermitAction(input: {
  projectId: string;
  slug: string;
  permitType: PermitType;
  permitLabel: string;
  status?: PermitStatus;
  targetApprovalDate?: string;
  expiresAt?: string;
  permitNumber?: string;
  issuingAuthority?: string;
  responsiblePerson?: string;
  notes?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { id } = await createPermit({
      projectId: input.projectId,
      permitType: input.permitType,
      permitLabel: input.permitLabel,
      status: input.status ?? "planned",
      targetApprovalDate: input.targetApprovalDate || undefined,
      expiresAt: input.expiresAt || undefined,
      permitNumber: input.permitNumber?.trim() || undefined,
      issuingAuthority: input.issuingAuthority?.trim() || undefined,
      responsiblePerson: input.responsiblePerson?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
    });
    revalidatePath(`/development-os/projects/${input.slug}/permits`);
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create permit.",
    };
  }
}

export async function transitionPermitStatusAction(input: {
  permitId: string;
  slug: string;
  newStatus: PermitStatus;
  receivedAt?: string;
  expiresAt?: string;
  rejectionReason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await transitionPermitStatus({
      permitId: input.permitId,
      newStatus: input.newStatus,
      receivedAt: input.receivedAt || undefined,
      expiresAt: input.expiresAt || undefined,
      rejectionReason: input.rejectionReason?.trim() || undefined,
    });
    revalidatePath(`/development-os/projects/${input.slug}/permits/${input.permitId}`);
    revalidatePath(`/development-os/projects/${input.slug}/permits`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update permit.",
    };
  }
}

export async function attachPermitDocumentAction(input: {
  permitId: string;
  slug: string;
  documentId: string;
  documentRole?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await attachPermitDocument({
      permitId: input.permitId,
      documentId: input.documentId,
      documentRole: input.documentRole?.trim() || undefined,
    });
    revalidatePath(`/development-os/projects/${input.slug}/permits/${input.permitId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to attach document.",
    };
  }
}
