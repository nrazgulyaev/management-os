import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  projectCompanyStructures,
  companyStructureShareholders,
} from "@/lib/db/schema/company-structures";
import { requireInternalUser } from "@/features/auth/permissions";

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
    const [structure] = await tx
      .insert(projectCompanyStructures)
      .values({
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
        isActive: true,
      })
      .returning();

    const inserted = await tx
      .insert(companyStructureShareholders)
      .values(
        parsed.shareholders.map((s) => ({
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
  const db = requireDb();
  const date = input.transitionDate ?? new Date().toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    await tx
      .update(projectCompanyStructures)
      .set({ isActive: false, effectiveUntil: date })
      .where(
        and(
          eq(projectCompanyStructures.projectId, input.projectId),
          eq(projectCompanyStructures.isActive, true),
          ne(projectCompanyStructures.id, input.newStructureId),
        ),
      );
    const [activated] = await tx
      .update(projectCompanyStructures)
      .set({ isActive: true, effectiveFrom: date })
      .where(eq(projectCompanyStructures.id, input.newStructureId))
      .returning();
    return activated;
  });
}
