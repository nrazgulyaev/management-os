"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { investors } from "@/lib/db/schema/investor-capital";
import {
  INVESTOR_TYPES,
  INVESTOR_STATUSES,
  LEGAL_ENTITY_TYPES,
  REPORTING_LANGUAGES,
  SUPPORTED_CURRENCIES,
  type InvestorStatus,
} from "@/lib/development/constants/investor-constants";
import type { CreateInvestorInput } from "@/lib/development/types/investors";

const createInvestorSchema = z.object({
  investorCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "investor_code: alphanumeric, dash, underscore"),
  investorType: z.enum(INVESTOR_TYPES),
  legalName: z.string().min(1).max(256),
  legalEntityType: z.enum(LEGAL_ENTITY_TYPES).optional().nullable(),
  taxResidency: z.string().max(8).optional().nullable(),
  primaryCurrency: z.enum(SUPPORTED_CURRENCIES).default("USD"),
  reportingLanguage: z.enum(REPORTING_LANGUAGES).default("en"),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(64).optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createInvestor(input: CreateInvestorInput): Promise<{
  id: string;
  investorCode: string;
}> {
  const parsed = createInvestorSchema.parse(input);
  const db = requireDb();

  const [row] = await db
    .insert(investors)
    .values({
      investorCode: parsed.investorCode,
      investorType: parsed.investorType,
      legalName: parsed.legalName,
      legalEntityType: parsed.legalEntityType ?? null,
      taxResidency: parsed.taxResidency ?? null,
      primaryCurrency: parsed.primaryCurrency,
      reportingLanguage: parsed.reportingLanguage,
      contactEmail: parsed.contactEmail ?? null,
      contactPhone: parsed.contactPhone ?? null,
      contactId: parsed.contactId ?? null,
      notes: parsed.notes ?? null,
    })
    .returning({ id: investors.id, investorCode: investors.investorCode });
  return row;
}

const updateInvestorSchema = createInvestorSchema.partial().extend({
  // investorCode change is allowed but should be rare; keep validation strict
  investorCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});

export async function updateInvestor(
  id: string,
  patch: Partial<CreateInvestorInput>,
): Promise<void> {
  const parsed = updateInvestorSchema.parse(patch);
  const db = requireDb();
  await db
    .update(investors)
    .set({
      ...(parsed.investorCode !== undefined && {
        investorCode: parsed.investorCode,
      }),
      ...(parsed.investorType !== undefined && {
        investorType: parsed.investorType,
      }),
      ...(parsed.legalName !== undefined && { legalName: parsed.legalName }),
      ...(parsed.legalEntityType !== undefined && {
        legalEntityType: parsed.legalEntityType,
      }),
      ...(parsed.taxResidency !== undefined && {
        taxResidency: parsed.taxResidency,
      }),
      ...(parsed.primaryCurrency !== undefined && {
        primaryCurrency: parsed.primaryCurrency,
      }),
      ...(parsed.reportingLanguage !== undefined && {
        reportingLanguage: parsed.reportingLanguage,
      }),
      ...(parsed.contactEmail !== undefined && {
        contactEmail: parsed.contactEmail,
      }),
      ...(parsed.contactPhone !== undefined && {
        contactPhone: parsed.contactPhone,
      }),
      ...(parsed.contactId !== undefined && { contactId: parsed.contactId }),
      ...(parsed.notes !== undefined && { notes: parsed.notes }),
      updatedAt: new Date(),
    })
    .where(eq(investors.id, id));
}

export async function setInvestorStatus(
  id: string,
  status: InvestorStatus,
): Promise<void> {
  const parsed = z.enum(INVESTOR_STATUSES).parse(status);
  const db = requireDb();
  await db
    .update(investors)
    .set({
      status: parsed,
      exitedAt: parsed === "exited" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(investors.id, id));
}
