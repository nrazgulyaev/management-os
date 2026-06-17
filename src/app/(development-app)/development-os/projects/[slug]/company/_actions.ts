"use server";

/**
 * UI action adapters for the company-structure cabinet. The underlying actions
 * live in a server-only module; these "use server" wrappers route through and
 * revalidate the relevant pages. All auth + org-scoping is enforced inside the
 * underlying actions (requireInternalUser + requireOrgId, org stamped on
 * insert).
 */

import { revalidatePath } from "next/cache";
import {
  createCompanyStructure,
  addCompanyShareholder,
  updateCompanyShareholder,
  transitionToNewStructure,
} from "@/lib/development/server/company-structure/company-actions";

type StructureType =
  | "arconique_owned"
  | "klr_real_estate"
  | "new_spv"
  | "joint_venture"
  | "landowner_partnership"
  | "nominee_structure"
  | "custom";

type ShareholderType =
  | "arconique"
  | "investor"
  | "klr_real_estate"
  | "land_owner"
  | "external_party";

type RegistrationStatus =
  | "planned"
  | "in_progress"
  | "registered"
  | "dissolved"
  | "on_hold";

export interface ShareholderInput {
  shareholderType: ShareholderType;
  displayName: string;
  ownershipPercentage: number;
  roleInCompany?: string | null;
  isManagingParty?: boolean;
}

export async function createCompanyStructureAction(input: {
  projectId: string;
  slug: string;
  structureLabel: string;
  structureType: StructureType;
  companyName?: string;
  companyRegistrationNumber?: string;
  country?: string;
  region?: string;
  registrationStatus?: RegistrationStatus;
  responsibleLegalConsultant?: string;
  notes?: string;
  shareholders: ShareholderInput[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { structure } = await createCompanyStructure({
      projectId: input.projectId,
      structureLabel: input.structureLabel,
      structureType: input.structureType,
      companyName: input.companyName?.trim() || null,
      companyRegistrationNumber:
        input.companyRegistrationNumber?.trim() || null,
      country: input.country?.trim() || null,
      region: input.region?.trim() || null,
      registrationStatus: input.registrationStatus ?? "planned",
      responsibleLegalConsultant:
        input.responsibleLegalConsultant?.trim() || null,
      notes: input.notes?.trim() || null,
      shareholders: input.shareholders.map((s) => ({
        shareholderType: s.shareholderType,
        displayName: s.displayName,
        ownershipPercentage: s.ownershipPercentage,
        roleInCompany: s.roleInCompany?.trim() || null,
        isManagingParty: s.isManagingParty ?? false,
      })),
    });
    revalidatePath(`/development-os/projects/${input.slug}/company`);
    return { ok: true, id: structure.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create structure.",
    };
  }
}

export async function addCompanyShareholderAction(input: {
  structureId: string;
  slug: string;
  shareholderType: ShareholderType;
  displayName: string;
  ownershipPercentage: number;
  roleInCompany?: string;
  isManagingParty?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await addCompanyShareholder({
      structureId: input.structureId,
      shareholderType: input.shareholderType,
      displayName: input.displayName,
      ownershipPercentage: input.ownershipPercentage,
      roleInCompany: input.roleInCompany?.trim() || null,
      isManagingParty: input.isManagingParty ?? false,
    });
    revalidatePath(
      `/development-os/projects/${input.slug}/company/${input.structureId}`,
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to add shareholder.",
    };
  }
}

export async function updateCompanyShareholderAction(input: {
  shareholderId: string;
  structureId: string;
  slug: string;
  displayName?: string;
  ownershipPercentage?: number;
  roleInCompany?: string | null;
  isManagingParty?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await updateCompanyShareholder({
      shareholderId: input.shareholderId,
      displayName: input.displayName,
      ownershipPercentage: input.ownershipPercentage,
      roleInCompany: input.roleInCompany,
      isManagingParty: input.isManagingParty,
    });
    revalidatePath(
      `/development-os/projects/${input.slug}/company/${input.structureId}`,
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update shareholder.",
    };
  }
}

export async function activateCompanyStructureAction(input: {
  projectId: string;
  structureId: string;
  slug: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await transitionToNewStructure({
      projectId: input.projectId,
      newStructureId: input.structureId,
    });
    revalidatePath(`/development-os/projects/${input.slug}/company`);
    revalidatePath(
      `/development-os/projects/${input.slug}/company/${input.structureId}`,
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to activate structure.",
    };
  }
}
