import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * W1a — Fund-position reads for the investor waterfall + capital-call
 * tooling. A "fund" here is a `projects` row; its LPs are the active
 * `capital_commitments` attached to that project. `pctOfFund` is each
 * commitment's share of the project's total committed (USD minor),
 * which is exactly the pro-rata key both `runWaterfall()` and
 * `draftCapitalCall()` expect.
 *
 * Self-contained for this unit (slight query duplication vs.
 * `lib/development/server/investors.ts` is fine for v1) so this branch
 * does not collide with sibling units touching the shared investor
 * query module.
 *
 * Money stays in USD MINOR units (cents) as strings end-to-end; the
 * caller converts to `number` cents only at the math boundary where
 * `runWaterfall`/`draftCapitalCall` operate on integer minor units.
 */

export interface FundLpPosition {
  /** capital_commitments.id — the per-LP position id. */
  commitmentId: string;
  investorId: string;
  investorCode: string;
  investorLegalName: string;
  /** committed_amount_usd_minor, as a string (bigint-safe). */
  committedUsdMinor: string;
  /** Received drawdowns to date, USD minor, as a string. */
  contributedUsdMinor: string;
  /** Share of the project's total committed, 0..100, 4dp. */
  pctOfFund: number;
}

export interface FundPosition {
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  /** Sum of committedUsdMinor across LPs, as a string. */
  totalCommittedUsdMinor: string;
  /** Sum of contributedUsdMinor across LPs, as a string. */
  totalContributedUsdMinor: string;
  lpCount: number;
  lps: FundLpPosition[];
}

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);

/**
 * Returns every project that has at least one active commitment, with
 * its LP positions and pre-computed pct-of-fund. Ordered by project
 * name; LPs ordered by committed size (largest first).
 */
export async function getFundPositions(): Promise<FundPosition[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db.execute(sql`
    SELECT
      cc.id                          AS commitment_id,
      cc.investor_id                 AS investor_id,
      i.investor_code                AS investor_code,
      i.legal_name                   AS investor_legal_name,
      cc.committed_amount_usd_minor  AS committed_usd_minor,
      coalesce(d.drawn_usd_minor, 0) AS contributed_usd_minor,
      cc.project_id                  AS project_id,
      p.name                         AS project_name,
      p.slug                         AS project_slug
    FROM capital_commitments cc
    JOIN investors i ON i.id = cc.investor_id
    JOIN projects p ON p.id = cc.project_id
    LEFT JOIN (
      SELECT commitment_id, sum(amount_usd_minor)::bigint AS drawn_usd_minor
      FROM capital_drawdowns
      WHERE status = 'received'
      GROUP BY commitment_id
    ) d ON d.commitment_id = cc.id
    WHERE cc.status = 'active'
      AND cc.project_id IS NOT NULL
    ORDER BY p.name ASC, cc.committed_amount_usd_minor DESC
  `);

  // Group commitments by project.
  const byProject = new Map<
    string,
    {
      projectName: string;
      projectSlug: string | null;
      raw: Array<{
        commitmentId: string;
        investorId: string;
        investorCode: string;
        investorLegalName: string;
        committedUsdMinor: bigint;
        contributedUsdMinor: bigint;
      }>;
    }
  >();

  for (const r of rows as Record<string, unknown>[]) {
    const projectId = String(r.project_id);
    let bucket = byProject.get(projectId);
    if (!bucket) {
      bucket = {
        projectName: String(r.project_name),
        projectSlug: r.project_slug ? String(r.project_slug) : null,
        raw: [],
      };
      byProject.set(projectId, bucket);
    }
    bucket.raw.push({
      commitmentId: String(r.commitment_id),
      investorId: String(r.investor_id),
      investorCode: String(r.investor_code),
      investorLegalName: String(r.investor_legal_name),
      committedUsdMinor: BigInt(toStr(r.committed_usd_minor)),
      contributedUsdMinor: BigInt(toStr(r.contributed_usd_minor)),
    });
  }

  const funds: FundPosition[] = [];
  for (const [projectId, bucket] of byProject) {
    const totalCommitted = bucket.raw.reduce(
      (n, l) => n + l.committedUsdMinor,
      0n,
    );
    const totalContributed = bucket.raw.reduce(
      (n, l) => n + l.contributedUsdMinor,
      0n,
    );
    const lps: FundLpPosition[] = bucket.raw.map((l) => ({
      commitmentId: l.commitmentId,
      investorId: l.investorId,
      investorCode: l.investorCode,
      investorLegalName: l.investorLegalName,
      committedUsdMinor: l.committedUsdMinor.toString(),
      contributedUsdMinor: l.contributedUsdMinor.toString(),
      // pct = committed / totalCommitted, 4dp. Integer-only math then /1e4.
      pctOfFund:
        totalCommitted > 0n
          ? Number((l.committedUsdMinor * 1_000_000n) / totalCommitted) / 10_000
          : 0,
    }));

    funds.push({
      projectId,
      projectName: bucket.projectName,
      projectSlug: bucket.projectSlug,
      totalCommittedUsdMinor: totalCommitted.toString(),
      totalContributedUsdMinor: totalContributed.toString(),
      lpCount: lps.length,
      lps,
    });
  }

  return funds;
}
