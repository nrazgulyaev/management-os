"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { ownerStatements } from "@/lib/db/schema/finance";
import {
  generateAllPendingStatements,
  generateStatementForOwnerVilla,
} from "@/features/finance/statement-generation";

/**
 * STATEMENT-1 — Statement workflow server actions.
 *
 * Simplified state machine per spec halt condition (collapses
 * pending_approval intermediate):
 *
 *   draft → approved → sent
 *      ↑    ↑
 *      └────┴─ disputed (operator can re-open)
 *
 * Every action org-scoped via requireOrgId() (TENANT-1).
 */

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function loadStatementForOrg(statementId: string) {
  const db = getDb();
  if (!db) return null;
  const orgId = await requireOrgId();
  const [row] = await db
    .select()
    .from(ownerStatements)
    .where(
      and(eq(ownerStatements.id, statementId), eq(ownerStatements.organizationId, orgId)),
    )
    .limit(1);
  return row ?? null;
}

export async function approveStatement(statementId: string): Promise<ActionResult> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "Sign in required" };
  const statement = await loadStatementForOrg(statementId);
  if (!statement) return { ok: false, error: "Statement not found" };
  if (statement.status === "approved" || statement.status === "sent") {
    return { ok: true };
  }
  await db
    .update(ownerStatements)
    .set({
      status: "approved",
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ownerStatements.id, statementId));
  revalidatePath("/dashboard/finance");
  return { ok: true };
}

export async function requestStatementChanges(
  statementId: string,
  notes: string,
): Promise<ActionResult> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const statement = await loadStatementForOrg(statementId);
  if (!statement) return { ok: false, error: "Statement not found" };
  await db
    .update(ownerStatements)
    .set({
      status: "disputed",
      disputeNotes: notes.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(eq(ownerStatements.id, statementId));
  revalidatePath("/dashboard/finance");
  return { ok: true };
}

export async function markStatementSent(
  statementId: string,
  sentToEmail: string,
): Promise<ActionResult & { emailReason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const statement = await loadStatementForOrg(statementId);
  if (!statement) return { ok: false, error: "Statement not found" };
  if (statement.status !== "approved" && statement.status !== "sent") {
    return { ok: false, error: "Statement must be approved before sending" };
  }

  // EMAIL-1 — fire the notification email best-effort. Failure does
  // not block the state transition; the operator can resend later.
  const { sendEmail, isEmailConfigured } = await import("@/features/email/email-service");
  const { statementReady } = await import("@/features/email/templates");
  let emailReason: string | undefined;
  if (isEmailConfigured() && sentToEmail && sentToEmail.includes("@")) {
    const monthLabel = statement.periodMonth
      ? new Date(statement.periodMonth + "T00:00:00Z").toLocaleString("en", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : "your statement";
    const tpl = statementReady({
      ownerFirstName: "there",
      monthLabel,
      villaCode: null,
      netToOwnerUsdMinor: statement.netToOwnerUsdMinor ?? 0n,
      portalUrl: "https://management.arconique.com/owner/statements",
    });
    const result = await sendEmail({
      to: sentToEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    if (!result.ok) emailReason = result.reason;
  } else if (!isEmailConfigured()) {
    emailReason = "no_api_key";
  }

  await db
    .update(ownerStatements)
    .set({
      status: "sent",
      sentAt: new Date(),
      sentToEmail,
      updatedAt: new Date(),
    })
    .where(eq(ownerStatements.id, statementId));
  revalidatePath("/dashboard/finance");
  return { ok: true, emailReason };
}

export async function generateAllForPeriod(periodMonth: string): Promise<ActionResult & { count?: number }> {
  try {
    const results = await generateAllPendingStatements(periodMonth);
    revalidatePath("/dashboard/finance");
    return { ok: true, count: results.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function regenerateStatement(
  ownerId: string,
  villaId: string,
  periodMonth: string,
): Promise<ActionResult> {
  try {
    const orgId = await requireOrgId();
    await generateStatementForOwnerVilla(orgId, ownerId, villaId, periodMonth);
    revalidatePath("/dashboard/finance");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
