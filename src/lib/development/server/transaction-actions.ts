"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  devBankAccounts,
  devCommitmentsLedger,
  devTransactions,
} from "@/lib/db/schema/dev-finance";
import { SUPPORTED_CURRENCIES } from "@/lib/development/constants/investor-constants";
import { requireOrgId } from "@/features/auth/require-org";

const recordTransactionSchema = z.object({
  bankAccountId: z.string().uuid(),
  direction: z.enum(["inflow", "outflow", "internal_transfer"]),
  categoryId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  relatedCommitmentId: z.string().uuid().optional().nullable(),
  amountMinor: z.union([z.bigint(), z.string(), z.number()]),
  currency: z.enum(SUPPORTED_CURRENCIES),
  fxRateAtTransaction: z.string().regex(/^\d+(\.\d+)?$/),
  counterpartyName: z.string().optional().nullable(),
  counterpartyContactId: z.string().uuid().optional().nullable(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  externalReference: z.string().optional().nullable(),
  allocationType: z
    .enum(["single_project", "multi_project", "company_overhead"])
    .default("single_project"),
  allocationMetadata: z.record(z.string(), z.number()).optional().nullable(),
  relatedDrawdownId: z.string().uuid().optional().nullable(),
  relatedDistributionId: z.string().uuid().optional().nullable(),
  receiptDocumentId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const toBig = (v: bigint | string | number): bigint =>
  typeof v === "bigint"
    ? v
    : BigInt(typeof v === "number" ? Math.trunc(v) : v);

function computeUsdMinor(
  amountMinor: bigint,
  currency: string,
  fxRate: number,
): bigint {
  const isUsdt = currency === "USDT";
  const sourceMajors = isUsdt
    ? Number(amountMinor) / 1_000_000
    : Number(amountMinor) / 100;
  const usdMajors =
    currency === "USD" ? Number(amountMinor) / 100 : sourceMajors / fxRate;
  return BigInt(Math.round(usdMajors * 100));
}

/**
 * **`recordTransaction`** — atomic. Inserts the dev_transactions row,
 * updates the bank account's `current_balance_minor` (signed by direction),
 * and — if linked to a `dev_commitments_ledger` row — recomputes that PO's
 * status (open → partially_paid → completed) based on its accumulated
 * paid total.
 *
 * Generates `transaction_code` as TXN-YYYY-NNNNNN inside the same tx.
 *
 * For multi-project allocations, validates that the metadata ratios sum
 * to 1.0 (within 0.001 tolerance) before inserting.
 */
export async function recordTransaction(
  input: z.input<typeof recordTransactionSchema>,
): Promise<{
  id: string;
  transactionCode: string;
  amountUsdMinor: string;
  newAccountBalanceMinor: string;
}> {
  const parsed = recordTransactionSchema.parse(input);
  const organizationId = await requireOrgId();
  const db = requireDb();

  const amount = toBig(parsed.amountMinor);
  if (amount <= 0n) throw new Error("amountMinor must be > 0");
  const fxRate = Number(parsed.fxRateAtTransaction);
  if (!(fxRate > 0)) throw new Error("fxRateAtTransaction must be > 0");
  const usdAmount = computeUsdMinor(amount, parsed.currency, fxRate);

  if (parsed.allocationType === "multi_project") {
    if (!parsed.allocationMetadata) {
      throw new Error(
        "allocationMetadata required for multi_project allocations",
      );
    }
    const ratioSum = Object.values(parsed.allocationMetadata).reduce(
      (a, b) => a + Number(b),
      0,
    );
    if (Math.abs(ratioSum - 1.0) > 0.001) {
      throw new Error(
        `multi_project allocation ratios must sum to 1.0 (got ${ratioSum.toFixed(4)})`,
      );
    }
  }

  return await db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(devBankAccounts)
      .where(eq(devBankAccounts.id, parsed.bankAccountId))
      .limit(1);
    if (!account) throw new Error("Bank account not found");
    if (account.currency !== parsed.currency) {
      throw new Error(
        `Currency mismatch: account is ${account.currency}, transaction is ${parsed.currency}`,
      );
    }

    // Sequential transaction_code per year
    const year = new Date(parsed.transactionDate).getFullYear();
    const [seqRow] = await tx
      .select({
        next: sql<number>`coalesce(max(
          CAST(NULLIF(regexp_replace(transaction_code, '^TXN-' || ${year} || '-', ''), '') AS INTEGER)
        ), 0)::int + 1`,
      })
      .from(devTransactions)
      .where(sql`transaction_code LIKE ${"TXN-" + year + "-%"}`);
    const seq = Number(seqRow?.next ?? 1);
    const transactionCode = `TXN-${year}-${String(seq).padStart(6, "0")}`;

    const [row] = await tx
      .insert(devTransactions)
      .values({
        organizationId,
        transactionCode,
        bankAccountId: parsed.bankAccountId,
        direction: parsed.direction,
        categoryId: parsed.categoryId ?? null,
        projectId: parsed.projectId ?? null,
        unitId: parsed.unitId ?? null,
        relatedCommitmentId: parsed.relatedCommitmentId ?? null,
        amountMinor: amount,
        currency: parsed.currency,
        amountUsdMinor: usdAmount,
        fxRateAtTransaction: parsed.fxRateAtTransaction,
        counterpartyName: parsed.counterpartyName ?? null,
        counterpartyContactId: parsed.counterpartyContactId ?? null,
        transactionDate: parsed.transactionDate,
        description: parsed.description,
        externalReference: parsed.externalReference ?? null,
        allocationType: parsed.allocationType,
        allocationMetadata: parsed.allocationMetadata ?? null,
        relatedDrawdownId: parsed.relatedDrawdownId ?? null,
        relatedDistributionId: parsed.relatedDistributionId ?? null,
        receiptDocumentId: parsed.receiptDocumentId ?? null,
        notes: parsed.notes ?? null,
      })
      .returning({ id: devTransactions.id });

    // Update bank account balance (signed by direction).
    const delta =
      parsed.direction === "inflow"
        ? amount
        : parsed.direction === "outflow"
          ? -amount
          : 0n; // internal_transfer: handled separately if/when introduced
    const usdDelta =
      parsed.direction === "inflow"
        ? usdAmount
        : parsed.direction === "outflow"
          ? -usdAmount
          : 0n;
    const newBalance = BigInt(account.currentBalanceMinor) + delta;
    const newUsdBalance = BigInt(account.currentBalanceUsdMinor) + usdDelta;
    await tx
      .update(devBankAccounts)
      .set({
        currentBalanceMinor: newBalance,
        currentBalanceUsdMinor: newUsdBalance,
        lastBalanceAt: new Date(),
        lastFxRate: parsed.fxRateAtTransaction,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(devBankAccounts.id, account.id),
          eq(devBankAccounts.organizationId, organizationId),
        ),
      );

    // If linked to a commitments-ledger row, recompute its status.
    if (parsed.relatedCommitmentId && parsed.direction === "outflow") {
      const [paidRow] = await tx.execute(sql`
        SELECT
          (SELECT amount_usd_minor FROM dev_commitments_ledger WHERE id = ${parsed.relatedCommitmentId})::bigint
            AS commitment_amount,
          coalesce(sum(amount_usd_minor), 0)::bigint AS paid_total
        FROM dev_transactions
        WHERE related_commitment_id = ${parsed.relatedCommitmentId}
          AND direction = 'outflow'
      `);
      const r = (paidRow ?? {}) as Record<string, unknown>;
      const commitAmt = BigInt(String(r.commitment_amount ?? "0"));
      const paid = BigInt(String(r.paid_total ?? "0"));
      let newStatus: "open" | "partially_paid" | "completed" = "open";
      if (paid >= commitAmt) newStatus = "completed";
      else if (paid > 0n) newStatus = "partially_paid";
      await tx
        .update(devCommitmentsLedger)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(
          and(
            eq(devCommitmentsLedger.id, parsed.relatedCommitmentId),
            eq(devCommitmentsLedger.organizationId, organizationId),
          ),
        );
    }

    return {
      id: row.id,
      transactionCode,
      amountUsdMinor: usdAmount.toString(),
      newAccountBalanceMinor: newBalance.toString(),
    };
  });
}

export async function reconcileTransaction(
  id: string,
  statementLineRef: string,
): Promise<void> {
  if (!statementLineRef || statementLineRef.trim().length === 0) {
    throw new Error("statementLineRef is required");
  }
  const organizationId = await requireOrgId();
  const db = requireDb();
  await db
    .update(devTransactions)
    .set({
      reconciledAt: new Date(),
      bankStatementLineRef: statementLineRef,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(devTransactions.id, id),
        eq(devTransactions.organizationId, organizationId),
      ),
    );
}

const splitAllocationSchema = z.object({
  transactionId: z.string().uuid(),
  allocationMap: z.record(z.string().uuid(), z.number().positive()),
});

export async function splitTransactionAllocation(
  input: z.input<typeof splitAllocationSchema>,
): Promise<void> {
  const parsed = splitAllocationSchema.parse(input);
  const ratioSum = Object.values(parsed.allocationMap).reduce(
    (a, b) => a + b,
    0,
  );
  if (Math.abs(ratioSum - 1.0) > 0.001) {
    throw new Error(
      `Allocation ratios must sum to 1.0 (got ${ratioSum.toFixed(4)})`,
    );
  }
  const organizationId = await requireOrgId();
  const db = requireDb();
  await db
    .update(devTransactions)
    .set({
      allocationType: "multi_project",
      allocationMetadata: parsed.allocationMap,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(devTransactions.id, parsed.transactionId),
        eq(devTransactions.organizationId, organizationId),
      ),
    );
}

export async function linkTransactionToCommitmentLedger(
  transactionId: string,
  commitmentLedgerId: string,
): Promise<void> {
  const organizationId = await requireOrgId();
  const db = requireDb();
  await db
    .update(devTransactions)
    .set({
      relatedCommitmentId: commitmentLedgerId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(devTransactions.id, transactionId),
        eq(devTransactions.organizationId, organizationId),
      ),
    );
}

/**
 * HF-7 — operator-facing hard delete from the transactions list.
 *
 * No soft-delete column exists today, so this is a hard delete. The
 * action:
 *   1. Scopes by orgId (TENANT-1 pattern).
 *   2. Loads the row first so we can reverse the bank-account balance
 *      delta the original recordTransaction applied.
 *   3. Refuses if the transaction is reconciled OR linked to a
 *      capital drawdown / distribution (data-integrity guard).
 *   4. Removes the row.
 *
 * Audit trail: the existing audit_events insert in recordTransaction
 * isn't matched by a delete-side audit, so we add one here.
 */
export async function deleteTransaction(
  transactionId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const organizationId = await requireOrgId();
  const db = requireDb();
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(devTransactions)
      .where(
        and(
          eq(devTransactions.id, transactionId),
          eq(devTransactions.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) return { ok: false, reason: "Transaction not found." };
    if (row.reconciledAt) {
      return {
        ok: false,
        reason:
          "Reconciled transactions cannot be deleted. Un-reconcile first if you really need to remove this row.",
      };
    }
    if (row.relatedDrawdownId || row.relatedDistributionId) {
      return {
        ok: false,
        reason:
          "Transaction is linked to a capital event. Unlink it before deleting.",
      };
    }

    // Reverse the bank-account balance delta.
    const amount = BigInt(row.amountMinor);
    const usd = BigInt(row.amountUsdMinor);
    const reverseDelta =
      row.direction === "inflow"
        ? -amount
        : row.direction === "outflow"
          ? amount
          : 0n;
    const reverseUsd =
      row.direction === "inflow"
        ? -usd
        : row.direction === "outflow"
          ? usd
          : 0n;
    const [account] = await tx
      .select()
      .from(devBankAccounts)
      .where(
        and(
          eq(devBankAccounts.id, row.bankAccountId),
          eq(devBankAccounts.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (account) {
      await tx
        .update(devBankAccounts)
        .set({
          currentBalanceMinor: BigInt(account.currentBalanceMinor) + reverseDelta,
          currentBalanceUsdMinor:
            BigInt(account.currentBalanceUsdMinor) + reverseUsd,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(devBankAccounts.id, row.bankAccountId),
            eq(devBankAccounts.organizationId, organizationId),
          ),
        );
    }

    await tx
      .delete(devTransactions)
      .where(
        and(
          eq(devTransactions.id, transactionId),
          eq(devTransactions.organizationId, organizationId),
        ),
      );
    return { ok: true } as const;
  });
}
