"use server";

/**
 * AR aging — "Remind" dunning action.
 *
 * Files a payment-reminder notification for one outstanding RECEIVABLE
 * invoice through the existing ADR-0010 notification spine
 * (`queueNotification` → notification_queue → delivery worker → in-app
 * inbox). External dunning channels (email/WhatsApp to the debtor) are
 * not wired for buyer contacts yet, so the reminder is addressed to the
 * finance team (role recipient, in_app channel) as a follow-up task that
 * references the invoice + counterparty. Permission-gated
 * (requireInternalUser), org-scoped (requireOrgId), audit-logged.
 * Dedupe-keyed per invoice per day so the button cannot spam the queue.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  requireInternalUser,
  getCurrentUserContext,
} from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import { queueNotification } from "@/features/notifications/services";
import { devInvoices } from "@/lib/db/schema/invoices";
import { vendors } from "@/lib/db/schema/site-operations";
import { contacts } from "@/lib/db/schema/contacts";

const ACCOUNTING_PATH = "/development-os/finance/accounting";

/**
 * Template key for AR reminders. Kept as a plain literal (NOT exported —
 * "use server" files may only export async functions); the accounting
 * page's "already reminded" lookup repeats the same literal.
 */
const AR_REMINDER_TEMPLATE_KEY = "finance.ar_payment_reminder";

const remindSchema = z.object({
  invoiceId: z.string().uuid(),
});

export type ArReminderResult =
  | { ok: true; status: "queued" | "suppressed" }
  | { ok: false; error: string };

/** Render bigint minor units as a plain 2dp number for notification copy. */
function fmtMinor(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const n = Number(abs) / 100;
  return `${neg ? "-" : ""}${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Queue an in-app payment reminder for an outstanding receivable invoice.
 * Validates the invoice belongs to the caller's org, is a receivable, and
 * still carries an outstanding balance. Suppressed (no duplicate row) when
 * a reminder for the same invoice is already queued today.
 */
export async function sendArPaymentReminderAction(
  input: z.input<typeof remindSchema>,
): Promise<ArReminderResult> {
  let parsed: z.infer<typeof remindSchema>;
  try {
    parsed = remindSchema.parse(input);
  } catch {
    return { ok: false, error: "Invalid input." };
  }

  try {
    await requireInternalUser();
    const organizationId = await requireOrgId();
    const db = requireDb();

    const [inv] = await db
      .select({
        id: devInvoices.id,
        invoiceNumber: devInvoices.invoiceNumber,
        status: devInvoices.status,
        currency: devInvoices.currency,
        dueDate: devInvoices.dueDate,
        totalMinor: devInvoices.totalMinor,
        paidMinor: devInvoices.paidMinor,
        vendorName: vendors.legalName,
        buyerName: contacts.fullName,
      })
      .from(devInvoices)
      .leftJoin(vendors, eq(vendors.id, devInvoices.vendorId))
      .leftJoin(contacts, eq(contacts.id, devInvoices.buyerContactId))
      .where(
        and(
          eq(devInvoices.id, parsed.invoiceId),
          eq(devInvoices.organizationId, organizationId),
          eq(devInvoices.invoiceType, "receivable"),
        ),
      )
      .limit(1);
    if (!inv) return { ok: false, error: "Receivable invoice not found." };

    if (["paid", "cancelled", "voided"].includes(inv.status)) {
      return { ok: false, error: `Invoice is ${inv.status} — nothing to remind about.` };
    }
    const outstanding = BigInt(inv.totalMinor) - BigInt(inv.paidMinor);
    if (outstanding <= 0n) {
      return { ok: false, error: "Invoice has no outstanding balance." };
    }

    const today = new Date().toISOString().slice(0, 10);
    const due = String(inv.dueDate);
    const dueMs = Date.parse(due);
    const daysPastDue = Number.isNaN(dueMs)
      ? 0
      : Math.floor((Date.parse(today) - dueMs) / 86_400_000);
    const counterparty = inv.buyerName ?? inv.vendorName ?? "Unknown counterparty";

    const queued = await queueNotification({
      recipientType: "role",
      organizationId,
      channel: "in_app",
      templateKey: AR_REMINDER_TEMPLATE_KEY,
      title: `Payment reminder: ${inv.invoiceNumber} — ${counterparty}`,
      body:
        `Receivable ${inv.invoiceNumber} for ${counterparty} has ` +
        `${fmtMinor(outstanding)} ${inv.currency} outstanding (due ${due}, ` +
        `${daysPastDue > 0 ? `${daysPastDue} days past due` : "not yet due"}). ` +
        `Follow up with the counterparty to collect payment.`,
      payload: {
        recipientRole: "finance_manager",
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        counterparty,
        outstandingMinor: outstanding.toString(),
        currency: inv.currency,
        dueDate: due,
        daysPastDue,
        href: `/development-os/finance/invoices/${inv.id}`,
      },
      priority: daysPastDue > 90 ? "high" : "normal",
      // One open reminder per invoice per day — duplicate clicks suppress.
      dedupeKey: `ar-reminder:${inv.id}:${today}`,
    });
    if (!queued) return { ok: false, error: "Database is not configured." };

    const ctx = await getCurrentUserContext();
    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      action: "finance.ar_reminder.filed",
      entityType: "dev_invoice",
      entityId: inv.id,
      before: null,
      after: {
        organizationId,
        invoiceNumber: inv.invoiceNumber,
        counterparty,
        outstandingMinor: outstanding.toString(),
        currency: inv.currency,
        daysPastDue,
        notificationId: queued.notificationId,
        queueStatus: queued.status,
      },
    });

    revalidatePath(ACCOUNTING_PATH);
    return { ok: true, status: queued.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Reminder failed.",
    };
  }
}
