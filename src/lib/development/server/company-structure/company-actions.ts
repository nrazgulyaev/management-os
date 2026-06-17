import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  projectCompanyStructures,
  companyStructureShareholders,
} from "@/lib/db/schema/company-structures";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

const STRUCTURE_TYPES = [
  "arconique_owned",
  "klr_real_estate",
  "new_spv",
  "joint_venture",
  "landowner_partnership",
  "nominee_structure",
  "custom",
] as const;

const SHAREHOLDER_TYPES = [
  "arconique",
  "investor",
  "klr_real_estate",
  "land_owner",
  "external_party",
] as const;

const createStructureSchema = z.object({
  projectId: z.string().uuid(),
  structureLabel: z.string().min(1),
  structureType: z.enum(STRUCTURE_TYPES),
  companyName: z.string().nullable().optional(),
  companyRegistrationNumber: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  registrationStatus: z
    .enum(["planned", "in_progress", "registered", "dissolved", "on_hold"])
    .default("planned"),
  registrationDate: z.string().nullable().optional(),
  setupCostMinor: z.bigint().nullable().optional(),
  setupCurrency: z.string().default("USD"),
  responsibleLegalConsultant: z.string().nullable().optional(),
  effectiveFrom: z.string().optional(),
  notes: z.string().nullable().optional(),
  shareholders: z
    .array(
      z.object({
        shareholderType: z.enum(SHAREHOLDER_TYPES),
        investorId: z.string().uuid().nullable().optional(),
        displayName: z.string().min(1),
        ownershipPercentage: z.number().positive().max(100),
        roleInCompany: z.string().nullable().optional(),
        isManagingParty: z.boolean().default(false),
      }),
    )
    .min(1),
});

/**
 * Create a structure + shareholders atomically. The DB trigger enforces
 * sum-to-100% at COMMIT — if shareholders fail to sum to exactly 100%,
 * the whole transaction aborts.
 */
export async function createCompanyStructure(
  input: z.input<typeof createStructureSchema>,
) {
  await requireInternalUser();
  // TENANCY — the structure + shareholder tables carry a nullable org anchor
  // that the read path (getCompanyStructure) filters on. Stamp org on insert
  // so newly-created structures are visible to their own tenant and isolated
  // from others.
  const organizationId = await requireOrgId();
  const parsed = createStructureSchema.parse(input);
  const db = requireDb();

  const sumPct = parsed.shareholders.reduce(
    (acc, s) => acc + s.ownershipPercentage,
    0,
  );
  if (Math.abs(sumPct - 100) > 0.001) {
    throw new Error(
      `shareholder ownership must sum to 100%, got ${sumPct.toFixed(4)}%`,
    );
  }

  return db.transaction(async (tx) => {
    // A partial unique index allows only ONE active structure per project
    // (project_company_structures_active_unique WHERE is_active). The first
    // structure for a project becomes active; any subsequent one is created
    // inactive and the operator promotes it via the "Make active" control
    // (transitionToNewStructure). This avoids a unique-violation on insert.
    const existingActive = await tx
      .select({ id: projectCompanyStructures.id })
      .from(projectCompanyStructures)
      .where(
        and(
          eq(projectCompanyStructures.projectId, parsed.projectId),
          eq(projectCompanyStructures.organizationId, organizationId),
          eq(projectCompanyStructures.isActive, true),
        ),
      )
      .limit(1);
    const isFirstActive = existingActive.length === 0;

    const [structure] = await tx
      .insert(projectCompanyStructures)
      .values({
        organizationId,
        projectId: parsed.projectId,
        structureLabel: parsed.structureLabel,
        structureType: parsed.structureType,
        companyName: parsed.companyName ?? null,
        companyRegistrationNumber: parsed.companyRegistrationNumber ?? null,
        country: parsed.country ?? null,
        region: parsed.region ?? null,
        registrationStatus: parsed.registrationStatus,
        registrationDate: parsed.registrationDate ?? null,
        setupCostMinor: parsed.setupCostMinor ?? null,
        setupCurrency: parsed.setupCurrency,
        responsibleLegalConsultant: parsed.responsibleLegalConsultant ?? null,
        effectiveFrom:
          parsed.effectiveFrom ?? new Date().toISOString().slice(0, 10),
        notes: parsed.notes ?? null,
        isActive: isFirstActive,
      })
      .returning();

    const inserted = await tx
      .insert(companyStructureShareholders)
      .values(
        parsed.shareholders.map((s) => ({
          organizationId,
          structureId: structure.id,
          shareholderType: s.shareholderType,
          investorId: s.investorId ?? null,
          displayName: s.displayName,
          ownershipPercentage: String(s.ownershipPercentage),
          roleInCompany: s.roleInCompany ?? null,
          isManagingParty: s.isManagingParty,
        })),
      )
      .returning();

    return { structure, shareholders: inserted };
  });
}

const SHAREHOLDER_TYPE_ENUM = z.enum(SHAREHOLDER_TYPES);

const addShareholderSchema = z.object({
  structureId: z.string().uuid(),
  shareholderType: SHAREHOLDER_TYPE_ENUM,
  displayName: z.string().min(1),
  ownershipPercentage: z.number().positive().max(100),
  investorId: z.string().uuid().nullable().optional(),
  roleInCompany: z.string().nullable().optional(),
  isManagingParty: z.boolean().default(false),
});

/**
 * Add a shareholder to an existing structure. The DB trigger re-checks the
 * sum-to-100% at COMMIT, so this will abort if the new total ≠ 100%. Scoped
 * to the caller's org via the parent structure.
 */
export async function addCompanyShareholder(
  input: z.input<typeof addShareholderSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = addShareholderSchema.parse(input);
  const db = requireDb();

  // Verify the structure belongs to the caller's org before inserting under it.
  const [structure] = await db
    .select({ id: projectCompanyStructures.id })
    .from(projectCompanyStructures)
    .where(
      and(
        eq(projectCompanyStructures.id, parsed.structureId),
        eq(projectCompanyStructures.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!structure) throw new Error("structure not found");

  const [row] = await db
    .insert(companyStructureShareholders)
    .values({
      organizationId,
      structureId: parsed.structureId,
      shareholderType: parsed.shareholderType,
      investorId: parsed.investorId ?? null,
      displayName: parsed.displayName,
      ownershipPercentage: String(parsed.ownershipPercentage),
      roleInCompany: parsed.roleInCompany ?? null,
      isManagingParty: parsed.isManagingParty,
    })
    .returning();
  return row;
}

const updateShareholderSchema = z.object({
  shareholderId: z.string().uuid(),
  displayName: z.string().min(1).optional(),
  ownershipPercentage: z.number().positive().max(100).optional(),
  roleInCompany: z.string().nullable().optional(),
  isManagingParty: z.boolean().optional(),
});

/**
 * Edit an existing shareholder (display name / ownership % / role / managing
 * flag), scoped to the caller's org. The sum-to-100% trigger re-validates at
 * COMMIT.
 */
export async function updateCompanyShareholder(
  input: z.input<typeof updateShareholderSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = updateShareholderSchema.parse(input);
  const db = requireDb();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.displayName !== undefined) updates.displayName = parsed.displayName;
  if (parsed.ownershipPercentage !== undefined) {
    updates.ownershipPercentage = String(parsed.ownershipPercentage);
  }
  if (parsed.roleInCompany !== undefined) {
    updates.roleInCompany = parsed.roleInCompany ?? null;
  }
  if (parsed.isManagingParty !== undefined) {
    updates.isManagingParty = parsed.isManagingParty;
  }

  const [row] = await db
    .update(companyStructureShareholders)
    .set(updates)
    .where(
      and(
        eq(companyStructureShareholders.id, parsed.shareholderId),
        eq(companyStructureShareholders.organizationId, organizationId),
      ),
    )
    .returning();
  if (!row) throw new Error("shareholder not found");
  return row;
}

/**
 * Replace the active structure with a new one (deactivate the old, mark
 * the new active, link both to the project). Atomic.
 */
export async function transitionToNewStructure(input: {
  projectId: string;
  newStructureId: string;
  transitionDate?: string;
}) {
  await requireInternalUser();
  // TENANCY — scope the deactivate/activate to the caller's org so an operator
  // cannot flip another tenant's active structure.
  const organizationId = await requireOrgId();
  const db = requireDb();
  const date = input.transitionDate ?? new Date().toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    // Confirm the target structure belongs to the caller's org + project.
    const [target] = await tx
      .select({ id: projectCompanyStructures.id })
      .from(projectCompanyStructures)
      .where(
        and(
          eq(projectCompanyStructures.id, input.newStructureId),
          eq(projectCompanyStructures.projectId, input.projectId),
          eq(projectCompanyStructures.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!target) throw new Error("structure not found");

    await tx
      .update(projectCompanyStructures)
      .set({ isActive: false, effectiveUntil: date })
      .where(
        and(
          eq(projectCompanyStructures.projectId, input.projectId),
          eq(projectCompanyStructures.organizationId, organizationId),
          eq(projectCompanyStructures.isActive, true),
          ne(projectCompanyStructures.id, input.newStructureId),
        ),
      );
    const [activated] = await tx
      .update(projectCompanyStructures)
      .set({ isActive: true, effectiveFrom: date })
      .where(
        and(
          eq(projectCompanyStructures.id, input.newStructureId),
          eq(projectCompanyStructures.organizationId, organizationId),
        ),
      )
      .returning();
    return activated;
  });
}
