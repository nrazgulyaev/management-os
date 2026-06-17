"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { ownerStatements, statementLines } from "@/lib/db/schema/finance";
import { ownerThreads } from "@/lib/db/schema/owner-threads";
import { recordAuditEvent } from "@/features/audit/services";
import {
  generateAllPendingStatementsViaEngine,
  regenerateOwnerVillaViaEngine,
} from "@/features/finance/statement-generator";
import {
  AUTO_ACK_DAYS,
  assertTransition,
  type OwnerStatementState,
} from "@/features/owner-statements/state-machine";

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
  // Legal transition guard (MASTER §6): only a not-yet-approved draft may be
  // approved. A `disputed` (or any other) status must be re-opened first —
  // previously this skipped the check and let a disputed statement be approved.
  if (statement.status !== "draft" && statement.status !== "draft_revised") {
    return {
      ok: false,
      error: `Cannot approve a statement in '${statement.status}' state`,
    };
  }
  await db
    .update(ownerStatements)
    .set({
      status: "approved",
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ownerStatements.id, statementId));
  await recordAuditEvent({
    actorUserId: user.id,
    action: "statement.approved",
    entityType: "owner_statement",
    entityId: statementId,
    before: { status: statement.status },
    after: { status: "approved" },
  });
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
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "Sign in required" };
  const statement = await loadStatementForOrg(statementId);
  if (!statement) return { ok: false, error: "Statement not found" };
  if (statement.status !== "approved" && statement.status !== "sent") {
    return { ok: false, error: "Statement must be approved before sending" };
  }

  // EMAIL-1 (founder decision): the email MUST genuinely send before we
  // advance the statement to `sent` and arm the owner lifecycle. A failed
  // send (provider error / not configured / threw) leaves the statement in
  // its current state so the operator can fix the email config and retry —
  // we never tell the owner a statement was sent when the email never left.
  const { sendEmail, isEmailConfigured } = await import("@/features/email/email-service");
  const { statementReady } = await import("@/features/email/templates");

  // A resend (statement already `sent`) only RE-fires the email; it does not
  // re-arm the owner lifecycle (the owner may have already viewed/disputed).
  // The first send→advance is the only path gated on success.
  const firstSend = statement.sentAt == null;

  let emailReason: string | undefined;
  let emailSent = false;
  if (!isEmailConfigured()) {
    emailReason = "no_api_key";
  } else if (!sentToEmail || !sentToEmail.includes("@")) {
    emailReason = "no_recipient_email";
  } else {
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
    try {
      const result = await sendEmail({
        to: sentToEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
      if (result.ok) {
        emailSent = true;
      } else {
        emailReason = result.reason;
      }
    } catch (e) {
      emailReason = e instanceof Error ? e.message : "send_threw";
    }
  }

  // BLOCK: send failed → do NOT advance status, do NOT arm the lifecycle.
  // Audit the failed attempt so the operator action is still traceable.
  if (!emailSent) {
    await recordAuditEvent({
      actorUserId: user.id,
      action: "statement.send_failed",
      entityType: "owner_statement",
      entityId: statementId,
      before: { status: statement.status },
      after: { status: statement.status, sentToEmail, firstSend, emailReason: emailReason ?? null },
    });
    const human =
      emailReason === "no_api_key"
        ? "no email provider is configured"
        : emailReason === "no_recipient_email"
          ? "no valid recipient email was provided"
          : emailReason ?? "unknown error";
    return {
      ok: false,
      error: `Email failed to send: ${human}. The statement was not marked sent — fix the email config and retry.`,
      emailReason,
    };
  }

  // Email genuinely sent. Advance to `sent`; the first send arms the owner
  // lifecycle (FC-OWNER-STATEMENTS §1, first row): the owner view unlocks at
  // `pending` and the 14d auto-ack timer starts. A resend must NOT reset an
  // owner who already viewed/acknowledged/disputed, so we only arm when
  // `sentAt` was null.
  const now = new Date();
  await db
    .update(ownerStatements)
    .set({
      status: "sent",
      sentAt: now,
      sentToEmail,
      updatedAt: now,
      ...(firstSend
        ? {
            ownerState: "pending",
            autoAckAt: new Date(now.getTime() + AUTO_ACK_DAYS * 86_400_000),
          }
        : {}),
    })
    .where(eq(ownerStatements.id, statementId));
  await recordAuditEvent({
    actorUserId: user.id,
    action: "statement.sent",
    entityType: "owner_statement",
    entityId: statementId,
    before: { status: statement.status },
    after: { status: "sent", sentToEmail, firstSend, emailReason: emailReason ?? null },
  });
  revalidatePath("/dashboard/finance");
  revalidatePath("/owner/statements");
  return { ok: true, emailReason };
}

/**
 * FC-OWNER-STATEMENTS §4.4 — Director resolves a dispute and reissues a
 * corrected statement (the bidirectional half: "owner disputes → admin
 * resolves → revised statement appears for the owner").
 *
 *   1. create a revised statement (draft) copying the disputed row's facts +
 *      its line items — the builder edits the correction, then approves+sends
 *      (which re-arms the owner lifecycle via markStatementSent).
 *   2. flip the old row owner_state disputed → superseded + link
 *      superseded_by_id → the new row (migration 0117).
 *   3. resolve the linked Mgmt Inbox dispute thread.
 *
 * Mgmt/org-scoped. The owner sees the old row as "Superseded" and re-enters at
 * `pending` on the new row once it is sent.
 */
export async function resolveDisputeAndReissue(
  statementId: string,
): Promise<ActionResult & { newStatementId?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "Sign in required" };

  const old = await loadStatementForOrg(statementId);
  if (!old) return { ok: false, error: "Statement not found" };
  if (old.ownerState !== "disputed") {
    return { ok: false, error: "Only a disputed statement can be resolved & reissued." };
  }
  // Server-enforced transition (MASTER §6).
  assertTransition(old.ownerState as OwnerStatementState, "superseded");

  // Unique revised code: strip any prior -R{n} suffix, append the count of
  // statements already sharing (owner, period) so repeated reissues stay unique.
  const base = old.statementCode.replace(/-R\d+$/, "");
  const siblings = await db
    .select({ id: ownerStatements.id })
    .from(ownerStatements)
    .where(
      and(eq(ownerStatements.ownerId, old.ownerId), eq(ownerStatements.periodId, old.periodId)),
    );
  const revisedCode = `${base}-R${siblings.length}`;

  // 1) revised statement — a draft copy the builder can correct.
  const [created] = await db
    .insert(ownerStatements)
    .values({
      ownerId: old.ownerId,
      villaId: old.villaId,
      projectId: old.projectId,
      periodId: old.periodId,
      statementCode: revisedCode,
      managementModel: old.managementModel,
      currency: old.currency,
      grossRevenueMinor: old.grossRevenueMinor,
      totalFeesMinor: old.totalFeesMinor,
      totalExpensesMinor: old.totalExpensesMinor,
      totalTaxesMinor: old.totalTaxesMinor,
      totalReservesMinor: old.totalReservesMinor,
      managementFeeMinor: old.managementFeeMinor,
      netPayoutMinor: old.netPayoutMinor,
      occupancyRate: old.occupancyRate,
      adrMinor: old.adrMinor,
      revparMinor: old.revparMinor,
      annualizedYield: old.annualizedYield,
      status: "draft",
      organizationId: old.organizationId,
      periodMonth: old.periodMonth,
      operatorCommissionPct: old.operatorCommissionPct,
      fxRateSnapshot: old.fxRateSnapshot,
      netToOwnerUsdMinor: old.netToOwnerUsdMinor,
      createdBy: user.id,
      ownerState: "pending",
    })
    .returning({ id: ownerStatements.id });

  // copy the line items so the revised draft is a valid starting point.
  const oldLines = await db
    .select()
    .from(statementLines)
    .where(eq(statementLines.statementId, statementId));
  if (oldLines.length) {
    await db.insert(statementLines).values(
      oldLines.map((l) => ({
        statementId: created.id,
        lineType: l.lineType,
        sourceTable: l.sourceTable,
        sourceId: l.sourceId,
        category: l.category,
        description: l.description,
        amountMinor: l.amountMinor,
        currency: l.currency,
        ownerVisible: l.ownerVisible,
        sortOrder: l.sortOrder,
      })),
    );
  }

  // 2) supersede the old row (forward link).
  await db
    .update(ownerStatements)
    .set({ ownerState: "superseded", supersededById: created.id, updatedAt: new Date() })
    .where(eq(ownerStatements.id, statementId));

  // 3) resolve the dispute thread.
  if (old.disputeThreadId) {
    await db
      .update(ownerThreads)
      .set({ status: "resolved", lastMessageAt: new Date() })
      .where(eq(ownerThreads.id, old.disputeThreadId));
  }

  await recordAuditEvent({
    actorUserId: user.id,
    action: "statement.superseded",
    entityType: "owner_statement",
    entityId: statementId,
    after: { supersededById: created.id, revisedCode },
  });
  await recordAuditEvent({
    actorUserId: user.id,
    action: "statement.reissued",
    entityType: "owner_statement",
    entityId: created.id,
    after: { revisedFrom: statementId },
  });

  revalidatePath("/dashboard/finance");
  revalidatePath("/owner/statements");
  return { ok: true, newStatementId: created.id };
}

export async function generateAllForPeriod(periodMonth: string): Promise<ActionResult & { count?: number }> {
  try {
    // CRON-CONVERGENCE: bulk monthly generation now runs the CANONICAL engine
    // (reproduce-cron config) per (owner, villa) — byte-exact with the legacy
    // formula path but with the Σ(lines)==net invariant enforced.
    const results = await generateAllPendingStatementsViaEngine(periodMonth);
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
    // CRON-CONVERGENCE: regenerate via the canonical engine (reproduce-cron
    // config) so a manual regenerate matches the monthly cron byte-for-byte.
    await regenerateOwnerVillaViaEngine(orgId, ownerId, villaId, periodMonth);
    revalidatePath("/dashboard/finance");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// -----------------------------------------------------------------------------
// FormData-shaped UI wrappers
// -----------------------------------------------------------------------------
// `regenerateStatement` / `requestStatementChanges` take positional args and
// are called by other server modules. The statement detail page needs plain
// FormData-shaped `(prev, formData)` actions for its inline <form>s, so these
// thin wrappers re-load the statement org-scoped (TENANT-1) and call through.
// They add no new authority — `loadStatementForOrg` returns null for a foreign
// id, and the underlying functions enforce org scope again.

export async function regenerateStatementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const statementId = String(formData.get("statementId") ?? "");
  if (!statementId) return { ok: false, error: "Missing statement id" };
  const statement = await loadStatementForOrg(statementId);
  if (!statement) return { ok: false, error: "Statement not found" };
  // Guard: only a not-yet-approved draft may be regenerated, so approved/sent
  // statements are never clobbered.
  if (statement.status !== "draft" && statement.status !== "draft_revised") {
    return {
      ok: false,
      error: `Cannot regenerate a statement in '${statement.status}' state`,
    };
  }
  if (!statement.ownerId || !statement.villaId || !statement.periodMonth) {
    return {
      ok: false,
      error: "Statement is missing owner / villa / period — cannot regenerate",
    };
  }
  return regenerateStatement(statement.ownerId, statement.villaId, statement.periodMonth);
}

export async function requestStatementChangesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const statementId = String(formData.get("statementId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!statementId) return { ok: false, error: "Missing statement id" };
  if (!notes) return { ok: false, error: "Please describe the changes needed." };
  return requestStatementChanges(statementId, notes);
}
