"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { devBankAccounts } from "@/lib/db/schema/dev-finance";
import { SUPPORTED_CURRENCIES } from "@/lib/development/constants/investor-constants";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";

// HF-5: multi-tenant tables (added by migration 0072) require
// organization_id on every INSERT and on the WHERE clause of every
// UPDATE/DELETE. Matches the established pattern from
// src/lib/banking/bookkeeper-actions.ts +
// src/lib/messaging/inbox-actions.ts etc.
async function requireDefaultOrgId(): Promise<string> {
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    throw new Error(
      "ARCONIQUE_DEFAULT organization missing — apply migration 0071",
    );
  }
  return org.id;
}

const createSchema = z.object({
  accountCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  accountName: z.string().min(1),
  accountType: z.enum(["bank", "crypto_exchange", "crypto_wallet", "cash"]),
  currency: z.enum(SUPPORTED_CURRENCIES),
  bankName: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  swiftCode: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  walletAddress: z.string().optional().nullable(),
  minimumBalanceThresholdMinor: z
    .union([z.bigint(), z.string(), z.number()])
    .optional()
    .nullable(),
  primaryProjectId: z.string().uuid().optional().nullable(),
  isCompanyAccount: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});

const toBig = (v: bigint | string | number): bigint =>
  typeof v === "bigint"
    ? v
    : BigInt(typeof v === "number" ? Math.trunc(v) : v);

export async function createBankAccount(
  input: z.input<typeof createSchema>,
): Promise<{ id: string; accountCode: string }> {
  const parsed = createSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireDefaultOrgId();
  const [row] = await db
    .insert(devBankAccounts)
    .values({
      organizationId,
      accountCode: parsed.accountCode,
      accountName: parsed.accountName,
      accountType: parsed.accountType,
      currency: parsed.currency,
      bankName: parsed.bankName ?? null,
      accountNumber: parsed.accountNumber ?? null,
      swiftCode: parsed.swiftCode ?? null,
      iban: parsed.iban ?? null,
      walletAddress: parsed.walletAddress ?? null,
      minimumBalanceThresholdMinor:
        parsed.minimumBalanceThresholdMinor != null
          ? toBig(parsed.minimumBalanceThresholdMinor)
          : null,
      primaryProjectId: parsed.primaryProjectId ?? null,
      isCompanyAccount: parsed.isCompanyAccount,
      notes: parsed.notes ?? null,
    })
    .returning({ id: devBankAccounts.id, accountCode: devBankAccounts.accountCode });
  return row;
}

export async function updateBankAccountThreshold(
  id: string,
  newThresholdMinor: bigint | string | number | null,
): Promise<void> {
  const db = requireDb();
  // HF-5: scope UPDATE by organization_id alongside id so a stale
  // session cannot mutate a row in a sibling tenant.
  const organizationId = await requireDefaultOrgId();
  await db
    .update(devBankAccounts)
    .set({
      minimumBalanceThresholdMinor:
        newThresholdMinor != null ? toBig(newThresholdMinor) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(devBankAccounts.id, id),
        eq(devBankAccounts.organizationId, organizationId),
      ),
    );
}

const recordBalanceSchema = z.object({
  id: z.string().uuid(),
  newBalanceMinor: z.union([z.bigint(), z.string(), z.number()]),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/),
});

export async function recordBankBalance(
  input: z.input<typeof recordBalanceSchema>,
): Promise<void> {
  const parsed = recordBalanceSchema.parse(input);
  const db = requireDb();
  // HF-5: scope SELECT + UPDATE by organization_id.
  const organizationId = await requireDefaultOrgId();
  const [account] = await db
    .select()
    .from(devBankAccounts)
    .where(
      and(
        eq(devBankAccounts.id, parsed.id),
        eq(devBankAccounts.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!account) throw new Error("Bank account not found");

  const balance = toBig(parsed.newBalanceMinor);
  const fx = Number(parsed.fxRate);
  if (!(fx > 0)) throw new Error("fxRate must be > 0");

  // Convert to USD using same logic as transaction-actions
  const isUsdt = account.currency === "USDT";
  const sourceMajors = isUsdt ? Number(balance) / 1_000_000 : Number(balance) / 100;
  const usdMajors =
    account.currency === "USD" ? Number(balance) / 100 : sourceMajors / fx;
  const usdMinor = BigInt(Math.round(usdMajors * 100));

  await db
    .update(devBankAccounts)
    .set({
      currentBalanceMinor: balance,
      currentBalanceUsdMinor: usdMinor,
      lastBalanceAt: new Date(parsed.asOfDate + "T12:00:00Z"),
      lastFxRate: parsed.fxRate,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(devBankAccounts.id, parsed.id),
        eq(devBankAccounts.organizationId, organizationId),
      ),
    );
}
