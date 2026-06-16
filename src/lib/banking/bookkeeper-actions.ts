"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  bankConnections,
  bankTransactions,
  reconciliationRules,
} from "@/lib/db/schema/banking";
import { contractGroups, invoices } from "@/lib/db/schema/sales";
import { devCostCategories } from "@/lib/db/schema/dev-finance";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  findUnfiledTaxDeclarations,
  describeUnfiledDeclaration,
} from "@/lib/development/server/tax/filing-gate";
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
  // TENANCY: `syncTransactionsForConnection` resolves the connection by id
  // ALONE (no org predicate) and then hits a live bank API + writes
  // bank_transactions. This is a "use server" endpoint taking a
  // client-supplied connectionId, so without an org-scoped existence check
  // any authenticated user could trigger a sync of another org's bank
  // connection. Gate it: confirm the connection belongs to the caller's org
  // before delegating.
  const orgId = await resolveActiveOrgId();
  const db = requireDb();
  const [conn] = await db
    .select({ id: bankConnections.id })
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.id, connectionId),
        eq(bankConnections.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!conn) {
    console.error("syncConnectionAction: connection not found in org");
    return;
  }
  // Pass orgId so the service re-scopes the connection lookup too — the
  // existence check above already gates this, but threading expectedOrgId
  // makes the sync safe-by-construction (no TOCTOU window) per the
  // syncTransactionsForConnection contract.
  const r = await syncTransactionsForConnection(connectionId, orgId);
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
  const orgId = await resolveActiveOrgId();
  const user = await getCurrentAppUser();
  const db = requireDb();

  // Validate the target category belongs to the caller's org before writing it
  // onto the transaction — mirrors matchInvoiceAction's invoice re-validation.
  // dev_cost_categories.organization_id is NOT NULL.
  if (parsed.data.categoryId) {
    const [cat] = await db
      .select({ id: devCostCategories.id })
      .from(devCostCategories)
      .where(
        and(
          eq(devCostCategories.id, parsed.data.categoryId),
          eq(devCostCategories.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!cat) {
      console.error("assignCategoryAction: category not found in org");
      return;
    }
  }

  await db
    .update(bankTransactions)
    .set({
      categoryId: parsed.data.categoryId,
      manuallyCategorized: true,
      categorizedBy: user?.id ?? null,
      categorizedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bankTransactions.id, parsed.data.bankTransactionId),
        eq(bankTransactions.organizationId, orgId),
      ),
    );
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
  const orgId = await resolveActiveOrgId();
  const user = await getCurrentAppUser();
  const db = requireDb();

  // Validate the target invoice belongs to the caller's org before linking.
  // `invoices` has no org column of its own — resolve it through its
  // contract group (contract_groups.organization_id, migration 0162/0163).
  if (parsed.data.invoiceId) {
    const [inv] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .innerJoin(
        contractGroups,
        eq(contractGroups.id, invoices.contractGroupId),
      )
      .where(
        and(
          eq(invoices.id, parsed.data.invoiceId),
          eq(contractGroups.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!inv) {
      console.error("matchInvoiceAction: invoice not found");
      return;
    }
  }

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
    .where(
      and(
        eq(bankTransactions.id, parsed.data.bankTransactionId),
        eq(bankTransactions.organizationId, orgId),
      ),
    );
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
  const orgId = await resolveActiveOrgId();
  const db = requireDb();
  await db
    .update(bankTransactions)
    .set({ matchStatus: "ignored", updatedAt: new Date() })
    .where(
      and(
        eq(bankTransactions.id, parsed.data.bankTransactionId),
        eq(bankTransactions.organizationId, orgId),
      ),
    );
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
  const orgId = await resolveActiveOrgId();
  const db = requireDb();
  await db
    .update(reconciliationRules)
    .set({ isActive, updatedAt: new Date() })
    .where(
      and(
        eq(reconciliationRules.id, ruleId),
        eq(reconciliationRules.organizationId, orgId),
      ),
    );
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
  // ID-TAX gate (migration 0164): a period cannot be closed until every tax
  // declaration overlapping it (nonzero tax, non-archived) is FILED with DJP
  // (filed_at stamped via markTaxPeriodReportFiled / fileTaxesForPeriod).
  const taxGate = await findUnfiledTaxDeclarations(
    orgId,
    parsed.data.periodStart,
    parsed.data.periodEnd,
  );
  if (taxGate.unfiled.length > 0) {
    console.error(
      "closePeriodAction: blocked — file these tax declarations first:",
      taxGate.unfiled.map(describeUnfiledDeclaration).join("; "),
    );
    return;
  }
  if (taxGate.total === 0) {
    console.warn(
      "closePeriodAction: no tax period reports overlap " +
        `${parsed.data.periodStart} → ${parsed.data.periodEnd} — ` +
        "closing without tax filings on record.",
    );
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
  const orgId = await resolveActiveOrgId();
  const user = await getCurrentAppUser();
  if (!user) return;
  await reopenPeriod({
    periodId: parsed.data.periodId,
    organizationId: orgId,
    reopenedBy: user.id,
    reason: parsed.data.reason,
  });
  revalidatePath("/development-os/finance/period-close");
}
