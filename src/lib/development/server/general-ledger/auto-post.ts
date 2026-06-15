import "server-only";

/**
 * GL auto-posting from the finance sub-ledgers, using the STANDARD chart of
 * accounts mapping (operator-approved):
 *   revenue_lines  →  Dr 1000 Cash & Bank   / Cr 4000 Rental Revenue
 *   expense_lines  →  Dr 5000 Operating Exp  / Cr 1000 Cash & Bank
 *
 * postJournal() is idempotent on the (source table, id) key, so re-running is
 * safe — already-posted lines return `reused` and create nothing. This is the
 * conservative cash-basis mapping; richer accrual mappings (AR/AP, owner
 * payable, VAT split) layer on later per line type.
 *
 * Money is bigint MINOR units throughout.
 */

import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { revenueLines, expenseLines } from "@/lib/db/schema/finance";
import { villas, projects } from "@/lib/db/schema/projects";
import { postJournal } from "./post-journal";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface AutoPostResult {
  revenuePosted: number;
  expensePosted: number;
  reused: number;
  error?: string;
}

export async function postFinanceToGl(
  organizationId: string,
  limit = 500,
): Promise<AutoPostResult> {
  const db = getDb();
  if (!db) return { revenuePosted: 0, expensePosted: 0, reused: 0 };

  // TENANCY (write-flow IDOR): revenue_lines / expense_lines have NO
  // organization_id, but they DO carry villa_id / project_id, and
  // projects.organizationId is the org anchor (villas → projects). Without
  // scoping, this would post EVERY tenant's posted lines into the caller's
  // org GL (cross-tenant money leak). Derive the caller's owned villa/project
  // id sets and only post lines anchored to them — same approach the owner
  // statement generator uses for these sub-ledgers.
  const ownedProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));
  const projectIds = ownedProjects.map((p) => p.id);
  const ownedVillas = projectIds.length
    ? await db
        .select({ id: villas.id })
        .from(villas)
        .where(inArray(villas.projectId, projectIds))
    : [];
  const villaIds = ownedVillas.map((v) => v.id);

  let revenuePosted = 0;
  let expensePosted = 0;
  let reused = 0;

  // No projects/villas in this org → no sub-ledger lines belong to it.
  if (projectIds.length === 0 && villaIds.length === 0) {
    return { revenuePosted: 0, expensePosted: 0, reused: 0 };
  }

  // A line belongs to the org if its villa_id is one of the org's villas OR
  // its project_id is one of the org's projects. Lines with neither FK set
  // have no tenant anchor and are intentionally excluded.
  const orgAnchorPredicates = [
    villaIds.length ? inArray(revenueLines.villaId, villaIds) : undefined,
    projectIds.length ? inArray(revenueLines.projectId, projectIds) : undefined,
  ].filter(Boolean);
  const expenseAnchorPredicates = [
    villaIds.length ? inArray(expenseLines.villaId, villaIds) : undefined,
    projectIds.length ? inArray(expenseLines.projectId, projectIds) : undefined,
  ].filter(Boolean);

  try {
    // ---- Revenue ----
    const revRows = await db
      .select()
      .from(revenueLines)
      .where(
        and(
          eq(revenueLines.status, "posted"),
          or(...orgAnchorPredicates),
        ),
      )
      .limit(limit);
    for (const r of revRows) {
      const amount = BigInt(r.amountMinor);
      if (amount <= 0n) continue;
      const res = await postJournal({
        organizationId,
        entryDate: r.serviceDate ?? today(),
        currency: r.currency,
        memo: `Revenue: ${r.description}`,
        source: { table: "revenue_lines", id: r.id },
        lines: [
          { accountCode: "1000", debitMinor: amount },
          { accountCode: "4000", creditMinor: amount },
        ],
      });
      if (res.reused) reused++;
      else revenuePosted++;
    }

    // ---- Expense ----
    const expRows = await db
      .select()
      .from(expenseLines)
      .where(
        and(
          eq(expenseLines.status, "posted"),
          or(...expenseAnchorPredicates),
        ),
      )
      .limit(limit);
    for (const e of expRows) {
      const amount = BigInt(e.amountMinor);
      if (amount <= 0n) continue;
      const res = await postJournal({
        organizationId,
        entryDate: e.expenseDate ?? today(),
        currency: e.currency,
        memo: `Expense: ${e.description}`,
        source: { table: "expense_lines", id: e.id },
        lines: [
          { accountCode: "5000", debitMinor: amount },
          { accountCode: "1000", creditMinor: amount },
        ],
      });
      if (res.reused) reused++;
      else expensePosted++;
    }
  } catch (e) {
    return {
      revenuePosted,
      expensePosted,
      reused,
      error: e instanceof Error ? e.message : "Posting failed.",
    };
  }

  return { revenuePosted, expensePosted, reused };
}
