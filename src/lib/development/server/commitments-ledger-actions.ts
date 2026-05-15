import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { devCommitmentsLedger } from "@/lib/db/schema/dev-finance";
import { SUPPORTED_CURRENCIES } from "@/lib/development/constants/investor-constants";
import { requireOrgId } from "@/features/auth/require-org";

const createSchema = z.object({
  projectId: z.string().uuid(),
  categoryId: z.string().uuid(),
  unitId: z.string().uuid().optional().nullable(),
  commitmentCode: z.string().min(1).max(64),
  vendorContactId: z.string().uuid().optional().nullable(),
  amountCurrency: z.enum(SUPPORTED_CURRENCIES),
  amountOriginalMinor: z.union([z.bigint(), z.string(), z.number()]),
  fxRateAtCommit: z.string().regex(/^\d+(\.\d+)?$/),
  description: z.string().min(1),
  committedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedCompletionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  contractDocumentId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const toBig = (v: bigint | string | number): bigint =>
  typeof v === "bigint"
    ? v
    : BigInt(typeof v === "number" ? Math.trunc(v) : v);

function computeUsdMinor(
  amount: bigint,
  currency: string,
  fx: number,
): bigint {
  const isUsdt = currency === "USDT";
  const sourceMajors = isUsdt ? Number(amount) / 1_000_000 : Number(amount) / 100;
  const usdMajors =
    currency === "USD" ? Number(amount) / 100 : sourceMajors / fx;
  return BigInt(Math.round(usdMajors * 100));
}

export async function createCommitmentLedger(
  input: z.input<typeof createSchema>,
): Promise<{ id: string; commitmentCode: string; amountUsdMinor: string }> {
  const parsed = createSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  const amount = toBig(parsed.amountOriginalMinor);
  const fx = Number(parsed.fxRateAtCommit);
  if (!(fx > 0)) throw new Error("fxRateAtCommit must be > 0");
  const usdAmount = computeUsdMinor(amount, parsed.amountCurrency, fx);
  const [row] = await db
    .insert(devCommitmentsLedger)
    .values({
      organizationId,
      projectId: parsed.projectId,
      categoryId: parsed.categoryId,
      unitId: parsed.unitId ?? null,
      commitmentCode: parsed.commitmentCode,
      vendorContactId: parsed.vendorContactId ?? null,
      amountUsdMinor: usdAmount,
      amountCurrency: parsed.amountCurrency,
      amountOriginalMinor: amount,
      fxRateAtCommit: parsed.fxRateAtCommit,
      description: parsed.description,
      committedDate: parsed.committedDate,
      expectedCompletionDate: parsed.expectedCompletionDate ?? null,
      contractDocumentId: parsed.contractDocumentId ?? null,
      notes: parsed.notes ?? null,
    })
    .returning({
      id: devCommitmentsLedger.id,
      commitmentCode: devCommitmentsLedger.commitmentCode,
    });
  return { ...row, amountUsdMinor: usdAmount.toString() };
}

export async function updateCommitmentLedgerStatus(
  id: string,
  newStatus: "open" | "partially_paid" | "completed" | "cancelled",
): Promise<void> {
  const db = requireDb();
  const organizationId = await requireOrgId();
  await db
    .update(devCommitmentsLedger)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(
      and(
        eq(devCommitmentsLedger.id, id),
        eq(devCommitmentsLedger.organizationId, organizationId),
      ),
    );
}

export async function cancelCommitmentLedger(
  id: string,
  reason: string,
): Promise<void> {
  if (!reason || reason.trim().length < 3) {
    throw new Error("cancelCommitmentLedger: reason is required (min 3 chars)");
  }
  const db = requireDb();
  const organizationId = await requireOrgId();
  await db
    .update(devCommitmentsLedger)
    .set({
      status: "cancelled",
      notes: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(devCommitmentsLedger.id, id),
        eq(devCommitmentsLedger.organizationId, organizationId),
      ),
    );
}
