import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerThreads, ownerMessages } from "@/lib/db/schema/owner-threads";
import { ownerStatements } from "@/lib/db/schema/finance";
import { owners } from "@/lib/db/schema/ownership";
import { villas } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Mgmt-side dispute intake (FC-OWNER-STATEMENTS §4.4). Org-scoped readers for
 * the Director's dispute inbox: open disputes land here as owner_threads
 * (kind='dispute', linked to the owner_statement). Owner-side readers in
 * features/owner-portal are owner-scoped; these are organization-scoped.
 */

export const DISPUTE_REASON_LABEL: Record<string, string> = {
  line_amount: "A line item looks wrong",
  line_missing: "Numbers don't match what I expected",
  fees_too_high: "Payout method or amount is incorrect",
  other: "Other",
};

function fmtPeriod(periodMonth: string | null): string {
  if (!periodMonth) return "—";
  const [y, m] = periodMonth.split("-").map(Number);
  if (!y || !m) return periodMonth;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", { month: "long", year: "numeric" });
}

export interface DisputeListRow {
  threadId: string;
  statementId: string;
  statementCode: string;
  ownerName: string;
  villaCode: string | null;
  periodLabel: string;
  reasonKind: string | null;
  reasonLabel: string;
  threadStatus: string;
  ownerState: string;
  netPayoutMinor: bigint;
  currency: string;
  openedAt: string;
  lastMessageAt: string;
}

export async function listOpenDisputes(opts?: {
  includeResolved?: boolean;
}): Promise<DisputeListRow[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();

  const filters = [
    eq(ownerThreads.kind, "dispute"),
    eq(ownerStatements.organizationId, orgId),
  ];
  if (!opts?.includeResolved) filters.push(eq(ownerThreads.status, "open"));

  const rows = await db
    .select({
      threadId: ownerThreads.id,
      threadStatus: ownerThreads.status,
      openedAt: ownerThreads.createdAt,
      lastMessageAt: ownerThreads.lastMessageAt,
      statementId: ownerStatements.id,
      statementCode: ownerStatements.statementCode,
      ownerState: ownerStatements.ownerState,
      reasonKind: ownerStatements.disputeReasonKind,
      netPayoutMinor: ownerStatements.netPayoutMinor,
      currency: ownerStatements.currency,
      periodMonth: ownerStatements.periodMonth,
      ownerName: owners.displayName,
      villaCode: villas.unitCode,
    })
    .from(ownerThreads)
    .innerJoin(ownerStatements, eq(ownerStatements.id, ownerThreads.relatedEntityId))
    .innerJoin(owners, eq(owners.id, ownerThreads.ownerId))
    .leftJoin(villas, eq(villas.id, ownerStatements.villaId))
    .where(and(...filters))
    .orderBy(desc(ownerThreads.lastMessageAt))
    .limit(100);

  return rows.map((r) => ({
    threadId: r.threadId,
    statementId: r.statementId,
    statementCode: r.statementCode,
    ownerName: r.ownerName,
    villaCode: r.villaCode ?? null,
    periodLabel: fmtPeriod(r.periodMonth),
    reasonKind: r.reasonKind,
    reasonLabel: r.reasonKind ? (DISPUTE_REASON_LABEL[r.reasonKind] ?? r.reasonKind) : "—",
    threadStatus: r.threadStatus,
    ownerState: r.ownerState,
    netPayoutMinor: r.netPayoutMinor,
    currency: r.currency,
    openedAt: r.openedAt.toISOString(),
    lastMessageAt: r.lastMessageAt.toISOString(),
  }));
}

export interface DisputeMessage {
  id: string;
  actorKind: string;
  body: string;
  sentAt: string;
}

export interface DisputeThread extends Omit<DisputeListRow, "lastMessageAt"> {
  subject: string;
  messages: DisputeMessage[];
}

export async function getDisputeThread(threadId: string): Promise<DisputeThread | null> {
  const db = getDb();
  if (!db) return null;
  const orgId = await requireOrgId();

  const [t] = await db
    .select({
      threadId: ownerThreads.id,
      subject: ownerThreads.subject,
      threadStatus: ownerThreads.status,
      openedAt: ownerThreads.createdAt,
      statementId: ownerStatements.id,
      statementCode: ownerStatements.statementCode,
      ownerState: ownerStatements.ownerState,
      reasonKind: ownerStatements.disputeReasonKind,
      netPayoutMinor: ownerStatements.netPayoutMinor,
      currency: ownerStatements.currency,
      periodMonth: ownerStatements.periodMonth,
      ownerName: owners.displayName,
      villaCode: villas.unitCode,
    })
    .from(ownerThreads)
    .innerJoin(ownerStatements, eq(ownerStatements.id, ownerThreads.relatedEntityId))
    .innerJoin(owners, eq(owners.id, ownerThreads.ownerId))
    .leftJoin(villas, eq(villas.id, ownerStatements.villaId))
    .where(
      and(
        eq(ownerThreads.id, threadId),
        eq(ownerThreads.kind, "dispute"),
        eq(ownerStatements.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!t) return null;

  const msgs = await db
    .select({
      id: ownerMessages.id,
      actorKind: ownerMessages.actorKind,
      body: ownerMessages.body,
      sentAt: ownerMessages.sentAt,
    })
    .from(ownerMessages)
    .where(eq(ownerMessages.threadId, threadId))
    .orderBy(asc(ownerMessages.sentAt));

  return {
    threadId: t.threadId,
    subject: t.subject,
    statementId: t.statementId,
    statementCode: t.statementCode,
    ownerName: t.ownerName,
    villaCode: t.villaCode ?? null,
    periodLabel: fmtPeriod(t.periodMonth),
    reasonKind: t.reasonKind,
    reasonLabel: t.reasonKind ? (DISPUTE_REASON_LABEL[t.reasonKind] ?? t.reasonKind) : "—",
    threadStatus: t.threadStatus,
    ownerState: t.ownerState,
    netPayoutMinor: t.netPayoutMinor,
    currency: t.currency,
    openedAt: t.openedAt.toISOString(),
    messages: msgs.map((m) => ({
      id: m.id,
      actorKind: m.actorKind,
      body: m.body,
      sentAt: m.sentAt.toISOString(),
    })),
  };
}
