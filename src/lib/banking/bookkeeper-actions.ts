"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { bankTransactions, reconciliationRules } from "@/lib/db/schema/banking";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  closePeriod,
  reopenPeriod,
  runAutoReconciliation,
  syncTransactionsForConnection,
} from "./service";

/**
 * Stage 6.P3.G — Server actions wired to the bookkeeper UI.
 *
 * Form actions return Promise<void> per the Next.js form-action
 * contract (preserved from P2.F's inbox-actions.ts pattern).
 * Programmatic callers (the cron handler) call the underlying
 * service functions directly.
 */

async function resolveActiveOrgId(): Promise<string> {
  return requireOrgId();
}

export async function syncConnectionAction(connectionId: string): Promise<void> {
  const r = await syncTransactionsForConnection(connectionId);
  revalidatePath("/development-os/finance/bank-review");
  revalidatePath("/development-os/finance/reconciliation");
  if (!r.ok) console.error("syncConnectionAction:", r.error);
}

export async function runReconciliationAction(): Promise<void> {
  const orgId = await resolveActiveOrgId();
  await runAutoReconciliation({ organizationId: orgId });
  revalidatePath("/development-os/finance/reconciliation");
  revalidatePath("/development-os/finance/bank-review");
}

const assignCategorySchema = z.object({
  bankTransactionId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
});

export async function assignCategoryAction(
  formData: FormData,
): Promise<void> {
  const parsed = assignCategorySchema.safeParse({
    bankTransactionId: formData.get("bankTransactionId"),
    categoryId: formData.get("categoryId") || null,
  });
  if (!parsed.success) {
    console.error(
      "assignCategoryAction validation:",
      parsed.error.issues[0]?.message,
    );
    return;
  }
  const user = await getCurrentAppUser();
  const db = requireDb();
  await db
    .update(bankTransactions)
    .set({
      categoryId: parsed.data.categoryId,
      manuallyCategorized: true,
      categorizedBy: user?.id ?? null,
      categorizedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bankTransactions.id, parsed.data.bankTransactionId));
  revalidatePath("/development-os/finance/bank-review");
}

const matchInvoiceSchema = z.object({
  bankTransactionId: z.string().uuid(),
  invoiceId: z.string().uuid().nullable(),
});

export async function matchInvoiceAction(formData: FormData): Promise<void> {
  const parsed = matchInvoiceSchema.safeParse({
    bankTransactionId: formData.get("bankTransactionId"),
    invoiceId: formData.get("invoiceId") || null,
  });
  if (!parsed.success) {
    console.error(
      "matchInvoiceAction validation:",
      parsed.error.issues[0]?.message,
    );
    return;
  }
  const user = await getCurrentAppUser();
  const db = requireDb();
  await db
    .update(bankTransactions)
    .set({
      matchedInvoiceId: parsed.data.invoiceId,
      matchStatus: parsed.data.invoiceId
        ? "manually_matched"
        : "unmatched",
      matchedAt: parsed.data.invoiceId ? new Date() : null,
      matchedBy: parsed.data.invoiceId ? user?.id ?? null : null,
      updatedAt: new Date(),
    })
    .where(eq(bankTransactions.id, parsed.data.bankTransactionId));
  revalidatePath("/development-os/finance/bank-review");
  revalidatePath("/development-os/finance/reconciliation");
}

const ignoreTransactionSchema = z.object({
  bankTransactionId: z.string().uuid(),
});

export async function ignoreTransactionAction(
  formData: FormData,
): Promise<void> {
  const parsed = ignoreTransactionSchema.safeParse({
    bankTransactionId: formData.get("bankTransactionId"),
  });
  if (!parsed.success) {
    console.error(
      "ignoreTransactionAction validation:",
      parsed.error.issues[0]?.message,
    );
    return;
  }
  const db = requireDb();
  await db
    .update(bankTransactions)
    .set({ matchStatus: "ignored", updatedAt: new Date() })
    .where(eq(bankTransactions.id, parsed.data.bankTransactionId));
  revalidatePath("/development-os/finance/bank-review");
  revalidatePath("/development-os/finance/reconciliation");
}

// ---------------------------------------------------------------------------
// Reconciliation rules
// ---------------------------------------------------------------------------

const createRuleSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  matchType: z.enum([
    "description_contains",
    "description_regex",
    "counterparty_match",
    "amount_range",
    "amount_exact",
    "date_range_match",
  ]),
  matchConfig: z.string().min(1),
  autoAssignCategoryId: z.string().uuid().optional(),
  autoMatchToVendorId: z.string().uuid().optional(),
  autoMatchToInvoiceStrategy: z
    .enum([
      "amount_only",
      "amount_and_date",
      "amount_date_vendor",
      "fuzzy_description",
    ])
    .optional(),
  priority: z.coerce.number().int().default(100),
});

export async function createRuleAction(formData: FormData): Promise<void> {
  const parsed = createRuleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    matchType: formData.get("matchType"),
    matchConfig: formData.get("matchConfig"),
    autoAssignCategoryId: formData.get("autoAssignCategoryId") ?? undefined,
    autoMatchToVendorId: formData.get("autoMatchToVendorId") ?? undefined,
    autoMatchToInvoiceStrategy:
      formData.get("autoMatchToInvoiceStrategy") ?? undefined,
    priority: formData.get("priority") ?? 100,
  });
  if (!parsed.success) {
    console.error(
      "createRuleAction validation:",
      parsed.error.issues[0]?.message,
    );
    return;
  }
  let matchConfig: Record<string, unknown>;
  try {
    matchConfig = JSON.parse(parsed.data.matchConfig) as Record<
      string,
      unknown
    >;
  } catch {
    console.error("createRuleAction: matchConfig must be JSON");
    return;
  }
  const orgId = await resolveActiveOrgId();
  const db = requireDb();
  await db.insert(reconciliationRules).values({
    organizationId: orgId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    matchType: parsed.data.matchType,
    matchConfig: matchConfig as never,
    autoAssignCategoryId: parsed.data.autoAssignCategoryId ?? null,
    autoMatchToVendorId: parsed.data.autoMatchToVendorId ?? null,
    autoMatchToInvoiceStrategy: parsed.data.autoMatchToInvoiceStrategy ?? null,
    priority: parsed.data.priority,
  });
  revalidatePath("/development-os/finance/rules");
}

export async function setRuleActiveAction(
  ruleId: string,
  isActive: boolean,
): Promise<void> {
  const db = requireDb();
  await db
    .update(reconciliationRules)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(reconciliationRules.id, ruleId));
  revalidatePath("/development-os/finance/rules");
}

// ---------------------------------------------------------------------------
// Period close
// ---------------------------------------------------------------------------

const closePeriodSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: z.enum(["month", "quarter", "year", "custom"]).default("month"),
  notes: z.string().max(500).optional(),
});

export async function closePeriodAction(formData: FormData): Promise<void> {
  const parsed = closePeriodSchema.safeParse({
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    scope: formData.get("scope") ?? "month",
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    console.error(
      "closePeriodAction validation:",
      parsed.error.issues[0]?.message,
    );
    return;
  }
  const orgId = await resolveActiveOrgId();
  const user = await getCurrentAppUser();
  if (!user) {
    console.error("closePeriodAction: no current user");
    return;
  }
  const r = await closePeriod({
    organizationId: orgId,
    periodStart: new Date(parsed.data.periodStart),
    periodEnd: new Date(parsed.data.periodEnd),
    scope: parsed.data.scope,
    closedBy: user.id,
    notes: parsed.data.notes,
  });
  revalidatePath("/development-os/finance/period-close");
  if (!r.ok) console.error("closePeriodAction:", r.error);
}

const reopenPeriodSchema = z.object({
  periodId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function reopenPeriodAction(formData: FormData): Promise<void> {
  const parsed = reopenPeriodSchema.safeParse({
    periodId: formData.get("periodId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    console.error(
      "reopenPeriodAction validation:",
      parsed.error.issues[0]?.message,
    );
    return;
  }
  const user = await getCurrentAppUser();
  if (!user) return;
  await reopenPeriod({
    periodId: parsed.data.periodId,
    reopenedBy: user.id,
    reason: parsed.data.reason,
  });
  revalidatePath("/development-os/finance/period-close");
}
