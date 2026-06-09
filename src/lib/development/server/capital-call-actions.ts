"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  capitalCalls,
  capitalCallAllocations,
  type CapitalCallKind,
} from "@/lib/db/schema/capital-calls";
import { capitalCommitments } from "@/lib/db/schema/investor-capital";
import { projects } from "@/lib/db/schema/projects";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import { draftCapitalCall } from "@/features/investors/capital-call-issuer";

/**
 * W1a — Issue a capital call against a project's LPs.
 *
 * The pro-rata split is re-derived SERVER-SIDE from the project's live
 * commitments (we never trust client-supplied per-LP amounts). Money is
 * carried as USD MINOR units (cents): `draftCapitalCall` does exact
 * integer pro-rata over cents (no float drift), and we convert cents →
 * `numeric(14,2)` USD majors only at the DB boundary.
 *
 * Inserts one `capital_calls` row (status `issued`) + one
 * `capital_call_allocations` row per LP, all in a single transaction, then
 * audit-logs. Permission: internal user + org scope.
 */

const CAPITAL_CALL_KINDS = [
  "initial",
  "construction_milestone",
  "overrun",
  "bridge",
  "final",
] as const satisfies readonly CapitalCallKind[];

const issueCapitalCallSchema = z.object({
  projectId: z.string().uuid(),
  /** Total to raise, in USD MINOR units (cents). */
  totalUsdMinor: z.union([z.bigint(), z.string(), z.number()]),
  kind: z.enum(CAPITAL_CALL_KINDS).default("construction_milestone"),
  purpose: z.string().min(1).max(2000),
  /** ISO date (YYYY-MM-DD). Defaults to today if omitted. */
  noticeAt: z.string().optional().nullable(),
  /** ISO date (YYYY-MM-DD). */
  dueAt: z.string().min(1),
});

export type IssueCapitalCallInput = z.input<typeof issueCapitalCallSchema>;

export interface IssueCapitalCallResult {
  id: string;
  ref: string;
  number: number;
  totalUsdMinor: string;
  allocationCount: number;
}

const toCents = (v: bigint | string | number): bigint => {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.round(v) : v);
};

/** cents (bigint) → "1234.56" string for a numeric(14,2) column. */
const centsToNumericString = (cents: bigint): string => {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
};

export async function issueCapitalCallAction(
  input: IssueCapitalCallInput,
): Promise<IssueCapitalCallResult> {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = issueCapitalCallSchema.parse(input);
  const db = requireDb();

  const totalCents = toCents(parsed.totalUsdMinor);
  if (totalCents <= 0n) {
    throw new Error("Capital call total must be greater than zero.");
  }
  // draftCapitalCall operates on JS `number`; cents fit safely under
  // Number.MAX_SAFE_INTEGER (~9.007e15 cents = ~$90T) for realistic calls.
  if (totalCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Capital call total is too large to allocate safely.");
  }

  const noticeAt = parsed.noticeAt
    ? new Date(parsed.noticeAt)
    : new Date();
  const dueAt = new Date(parsed.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    throw new Error("Invalid due date.");
  }

  // Pull the project + its live active commitments. Re-deriving the
  // pro-rata split here (rather than trusting the client) is the whole
  // point of doing this server-side.
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, parsed.projectId))
    .limit(1);
  if (!project) {
    throw new Error("Project not found.");
  }

  const commitmentRows = await db
    .select({
      id: capitalCommitments.id,
      investorId: capitalCommitments.investorId,
      committedUsdMinor: capitalCommitments.committedAmountUsdMinor,
    })
    .from(capitalCommitments)
    .where(
      sql`${capitalCommitments.projectId} = ${parsed.projectId} AND ${capitalCommitments.status} = 'active'`,
    );

  if (commitmentRows.length === 0) {
    throw new Error(
      "Project has no active commitments to allocate a capital call against.",
    );
  }

  const totalCommitted = commitmentRows.reduce(
    (n, c) => n + BigInt(c.committedUsdMinor),
    0n,
  );
  if (totalCommitted <= 0n) {
    throw new Error("Project's total committed capital is zero.");
  }

  // Map investorId → committed share. Multiple commitments per investor
  // on one project are collapsed onto the investor (allocations FK is to
  // investors.id), summing their committed amounts.
  const byInvestor = new Map<string, bigint>();
  for (const c of commitmentRows) {
    byInvestor.set(
      c.investorId,
      (byInvestor.get(c.investorId) ?? 0n) + BigInt(c.committedUsdMinor),
    );
  }

  const lps = Array.from(byInvestor.entries()).map(([investorId, committed]) => ({
    lpId: investorId,
    pctOfFund:
      Number((committed * 1_000_000n) / totalCommitted) / 10_000,
  }));

  // Build a project ref slug from the name (uppercase alnum, max 6).
  const slug =
    project.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6) || "PROJ";

  // The call sequence number is derived from COUNT(*)+1, which is racy
  // against concurrent issues on the same project: two callers can compute
  // the same number → the same ref → a UNIQUE violation on `capital_calls.ref`.
  // Derive the number INSIDE the transaction and bound-retry the whole txn
  // body on a Postgres unique_violation (SQLSTATE 23505), recomputing the
  // count → ref each attempt so concurrent issues serialize onto distinct
  // refs instead of throwing a raw collision error to the user.
  const MAX_REF_ATTEMPTS = 5;
  let result:
    | {
        id: string;
        ref: string;
        number: number;
        allocationCount: number;
        allocatedTotal: number;
      }
    | null = null;

  for (let attempt = 0; attempt < MAX_REF_ATTEMPTS; attempt += 1) {
    try {
      result = await db.transaction(async (tx) => {
        const [countRow] = await tx.execute(sql`
          SELECT count(*)::int AS n FROM capital_calls WHERE project_id = ${parsed.projectId}
        `);
        const number =
          Number((countRow as Record<string, unknown> | undefined)?.n ?? 0) + 1;
        const ref = `CC-${slug}-${String(number).padStart(4, "0")}`;

        // Exact integer pro-rata over cents — sum always equals totalCents.
        const draft = draftCapitalCall({
          fundId: parsed.projectId,
          number,
          totalUsd: Number(totalCents),
          purpose: parsed.purpose,
          noticeAt: noticeAt.toISOString(),
          dueAt: dueAt.toISOString(),
          lps,
        });

        const [call] = await tx
          .insert(capitalCalls)
          .values({
            projectId: parsed.projectId,
            ref,
            kind: parsed.kind,
            issuedAt: new Date(),
            dueAt,
            totalUsd: centsToNumericString(totalCents),
            status: "issued",
            notes: parsed.purpose,
            createdByUserId: ctx.appUser?.id ?? null,
          })
          .returning({ id: capitalCalls.id, ref: capitalCalls.ref });

        if (draft.allocations.length > 0) {
          await tx.insert(capitalCallAllocations).values(
            draft.allocations.map((a) => ({
              callId: call.id,
              investorId: a.lpId,
              allocatedUsd: centsToNumericString(BigInt(Math.round(a.amount))),
            })),
          );
        }

        return {
          id: call.id,
          ref: call.ref,
          number,
          allocationCount: draft.allocations.length,
          allocatedTotal: draft.allocatedTotal,
        };
      });
      break;
    } catch (err) {
      // Retry only on a ref UNIQUE collision (Postgres unique_violation,
      // SQLSTATE 23505); rethrow anything else immediately. The pg error
      // carries `.code === "23505"` and its message also includes it — match
      // both for robustness (mirrors the 23505 handling elsewhere in src).
      const code = (err as { code?: unknown } | null)?.code;
      const message = err instanceof Error ? err.message : String(err);
      const isUniqueViolation = code === "23505" || message.includes("23505");
      if (isUniqueViolation && attempt < MAX_REF_ATTEMPTS - 1) {
        continue;
      }
      throw err;
    }
  }

  if (!result) {
    throw new Error(
      "Could not allocate a unique capital-call reference after several attempts. Please retry.",
    );
  }

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "capital_call.issue",
    entityType: "capital_call",
    entityId: result.id,
    after: {
      ref: result.ref,
      projectId: parsed.projectId,
      organizationId,
      kind: parsed.kind,
      totalUsdMinor: totalCents.toString(),
      dueAt: dueAt.toISOString(),
      allocationCount: result.allocationCount,
    },
    metadata: {
      purpose: parsed.purpose,
      allocatedTotalCents: result.allocatedTotal,
    },
  });

  return {
    id: result.id,
    ref: result.ref,
    number: result.number,
    totalUsdMinor: totalCents.toString(),
    allocationCount: result.allocationCount,
  };
}
