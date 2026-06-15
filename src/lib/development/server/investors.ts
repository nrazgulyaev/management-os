import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { investors } from "@/lib/db/schema/investor-capital";
import type {
  InvestorListItem,
  InvestorDetail,
  InvestorMetrics,
  CommitmentListItem,
} from "@/lib/development/types/investors";
import type {
  InvestorStatus,
  InvestorType,
} from "@/lib/development/constants/investor-constants";

/**
 * Read-side server queries for the investors entity. All marked
 * `server-only` so they cannot be bundled into client components. Pages
 * that need to render data should call these on the server and pass the
 * result down as serialized props.
 *
 * Counts and aggregates use `count(*) FILTER (WHERE …)` pattern (one
 * round-trip per metric block) — same lesson as the Sales page.
 */

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);
const toNum = (v: unknown): number =>
  v === null || v === undefined ? 0 : Number(v);

export interface InvestorFilters {
  status?: InvestorStatus;
  type?: InvestorType;
  projectId?: string;
}

export async function getInvestors(
  filters: InvestorFilters = {},
): Promise<InvestorListItem[]> {
  const db = getDb();
  if (!db) return [];

  const organizationId = await requireOrgId();
  const conditions: ReturnType<typeof sql>[] = [
    sql`i.organization_id = ${organizationId}`,
  ];
  if (filters.status) conditions.push(sql`i.status = ${filters.status}`);
  if (filters.type) conditions.push(sql`i.investor_type = ${filters.type}`);
  if (filters.projectId)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM capital_commitments c
        WHERE c.investor_id = i.id AND c.project_id = ${filters.projectId})`,
    );
  const where = conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.investor_code,
      i.legal_name,
      i.investor_type,
      i.legal_entity_type,
      i.tax_residency,
      i.primary_currency,
      i.reporting_language,
      i.contact_email,
      i.contact_phone,
      i.status,
      i.onboarded_at,
      i.exited_at,
      coalesce(c.commitment_count, 0) AS commitment_count,
      coalesce(c.total_committed_usd_minor, 0) AS total_committed_usd_minor,
      coalesce(w.total_drawn_usd_minor, 0) AS total_drawn_usd_minor,
      coalesce(w.total_distributed_usd_minor, 0) AS total_distributed_usd_minor,
      coalesce(w.wallet_available_total_usd_minor, 0) AS wallet_available_total_usd_minor
    FROM investors i
    LEFT JOIN (
      SELECT
        investor_id,
        count(*)::int AS commitment_count,
        sum(committed_amount_usd_minor)::bigint AS total_committed_usd_minor
      FROM capital_commitments
      GROUP BY investor_id
    ) c ON c.investor_id = i.id
    LEFT JOIN (
      SELECT
        cc.investor_id,
        sum(iw.total_drawn_usd_minor)::bigint AS total_drawn_usd_minor,
        sum(iw.total_returned_capital_usd_minor + iw.total_profit_distributed_usd_minor)::bigint
          AS total_distributed_usd_minor,
        sum(iw.available_balance_usd_minor)::bigint AS wallet_available_total_usd_minor
      FROM investor_wallets iw
      JOIN capital_commitments cc ON cc.id = iw.commitment_id
      GROUP BY cc.investor_id
    ) w ON w.investor_id = i.id
    ${where}
    ORDER BY i.investor_code ASC
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    investorCode: String(r.investor_code),
    legalName: String(r.legal_name),
    investorType: r.investor_type as InvestorType,
    legalEntityType: r.legal_entity_type
      ? (String(r.legal_entity_type) as InvestorListItem["legalEntityType"])
      : null,
    taxResidency: r.tax_residency ? String(r.tax_residency) : null,
    primaryCurrency: r.primary_currency as InvestorListItem["primaryCurrency"],
    reportingLanguage:
      r.reporting_language as InvestorListItem["reportingLanguage"],
    contactEmail: r.contact_email ? String(r.contact_email) : null,
    contactPhone: r.contact_phone ? String(r.contact_phone) : null,
    status: r.status as InvestorStatus,
    onboardedAt: new Date(r.onboarded_at as string).toISOString(),
    exitedAt: r.exited_at ? new Date(r.exited_at as string).toISOString() : null,
    commitmentCount: toNum(r.commitment_count),
    totalCommittedUsdMinor: toStr(r.total_committed_usd_minor),
    totalDrawnUsdMinor: toStr(r.total_drawn_usd_minor),
    totalDistributedUsdMinor: toStr(r.total_distributed_usd_minor),
    walletAvailableTotalUsdMinor: toStr(r.wallet_available_total_usd_minor),
  }));
}

export async function getInvestor(idOrCode: string): Promise<InvestorDetail | null> {
  const db = getDb();
  if (!db) return null;

  // getInvestors() is org-scoped (requireOrgId), so the resolved investor is
  // already guaranteed to belong to the caller's org — a cross-org id/code
  // simply won't be found and returns null (page notFound()s).
  const organizationId = await requireOrgId();
  const list = await getInvestors();
  const investor = list.find(
    (i) => i.id === idOrCode || i.investorCode === idOrCode,
  );
  if (!investor) return null;

  const [base] = await db
    .select({ contactId: investors.contactId, notes: investors.notes })
    .from(investors)
    .where(
      and(
        eq(investors.id, investor.id),
        eq(investors.organizationId, organizationId),
      ),
    )
    .limit(1);

  const commitments = await getCommitmentsByInvestor(investor.id, organizationId);

  return {
    ...investor,
    contactId: base?.contactId ?? null,
    notes: base?.notes ?? null,
    commitments,
  };
}

export async function getInvestorMetrics(): Promise<InvestorMetrics> {
  const db = getDb();
  if (!db) {
    return {
      totalInvestors: 0,
      byType: {
        gp: 0,
        lp_private: 0,
        lp_institutional: 0,
        landowner_jv: 0,
      },
      byStatus: { active: 0, inactive: 0, exited: 0 },
      totalCommittedUsdMinor: "0",
      totalDrawnUsdMinor: "0",
      totalDistributedUsdMinor: "0",
      totalWalletAvailableUsdMinor: "0",
    };
  }

  const organizationId = await requireOrgId();

  const [row] = await db.execute(sql`
    SELECT
      count(*)::int AS total_investors,
      count(*) FILTER (WHERE investor_type='gp')::int AS type_gp,
      count(*) FILTER (WHERE investor_type='lp_private')::int AS type_lp_private,
      count(*) FILTER (WHERE investor_type='lp_institutional')::int AS type_lp_inst,
      count(*) FILTER (WHERE investor_type='landowner_jv')::int AS type_landowner,
      count(*) FILTER (WHERE status='active')::int AS status_active,
      count(*) FILTER (WHERE status='inactive')::int AS status_inactive,
      count(*) FILTER (WHERE status='exited')::int AS status_exited
    FROM investors
    WHERE organization_id = ${organizationId}
  `);

  const [aggRow] = await db.execute(sql`
    SELECT
      coalesce(sum(c.committed_amount_usd_minor), 0)::bigint AS total_committed,
      coalesce(sum(w.total_drawn_usd_minor), 0)::bigint AS total_drawn,
      coalesce(sum(w.total_returned_capital_usd_minor + w.total_profit_distributed_usd_minor), 0)::bigint
        AS total_distributed,
      coalesce(sum(w.available_balance_usd_minor), 0)::bigint AS total_wallet_available
    FROM capital_commitments c
    LEFT JOIN investor_wallets w ON w.commitment_id = c.id
    WHERE c.organization_id = ${organizationId}
  `);

  const r = (row ?? {}) as Record<string, unknown>;
  const a = (aggRow ?? {}) as Record<string, unknown>;
  return {
    totalInvestors: toNum(r.total_investors),
    byType: {
      gp: toNum(r.type_gp),
      lp_private: toNum(r.type_lp_private),
      lp_institutional: toNum(r.type_lp_inst),
      landowner_jv: toNum(r.type_landowner),
    },
    byStatus: {
      active: toNum(r.status_active),
      inactive: toNum(r.status_inactive),
      exited: toNum(r.status_exited),
    },
    totalCommittedUsdMinor: toStr(a.total_committed),
    totalDrawnUsdMinor: toStr(a.total_drawn),
    totalDistributedUsdMinor: toStr(a.total_distributed),
    totalWalletAvailableUsdMinor: toStr(a.total_wallet_available),
  };
}

// -----------------------------------------------------------------------------
// Commitments — co-located here because the list-by-investor query is small
// and shared with the investor detail page. A separate `commitments.ts`
// covers the cross-investor list and per-commitment detail.
// -----------------------------------------------------------------------------

async function getCommitmentsByInvestor(
  investorId: string,
  organizationId?: string,
): Promise<CommitmentListItem[]> {
  const db = getDb();
  if (!db) return [];
  return getCommitmentsRaw({ investorId }, organizationId);
}

export interface CommitmentFilters {
  investorId?: string;
  projectId?: string;
  status?: import("../constants/investor-constants").CommitmentStatus;
}

export async function getCommitments(
  filters: CommitmentFilters = {},
): Promise<CommitmentListItem[]> {
  return getCommitmentsRaw(filters);
}

async function getCommitmentsRaw(
  filters: CommitmentFilters,
  organizationId?: string,
): Promise<CommitmentListItem[]> {
  const db = getDb();
  if (!db) return [];

  const orgId = organizationId ?? (await requireOrgId());
  const conditions: ReturnType<typeof sql>[] = [
    sql`cc.organization_id = ${orgId}`,
  ];
  if (filters.investorId)
    conditions.push(sql`cc.investor_id = ${filters.investorId}`);
  if (filters.projectId) conditions.push(sql`cc.project_id = ${filters.projectId}`);
  if (filters.status) conditions.push(sql`cc.status = ${filters.status}`);
  const where = conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      cc.id,
      cc.commitment_code,
      cc.investor_id,
      i.investor_code,
      i.legal_name AS investor_legal_name,
      i.investor_type,
      cc.project_id,
      p.name AS project_name,
      p.slug AS project_slug,
      cc.committed_amount_minor,
      cc.committed_currency,
      cc.committed_amount_usd_minor,
      cc.fx_rate_at_commitment,
      cc.profit_share_percent,
      cc.capital_return_priority,
      cc.is_landowner_jv,
      cc.status,
      cc.signed_at,
      coalesce(d.drawn_usd_minor, 0)::bigint AS drawn_usd_minor,
      coalesce(w.available_balance_usd_minor, 0)::bigint AS wallet_available_usd_minor
    FROM capital_commitments cc
    JOIN investors i ON i.id = cc.investor_id
    LEFT JOIN projects p ON p.id = cc.project_id
    LEFT JOIN (
      SELECT commitment_id, sum(amount_usd_minor)::bigint AS drawn_usd_minor
      FROM capital_drawdowns
      WHERE status = 'received'
      GROUP BY commitment_id
    ) d ON d.commitment_id = cc.id
    LEFT JOIN investor_wallets w ON w.commitment_id = cc.id
    ${where}
    ORDER BY cc.commitment_code ASC
  `);

  return (rows as Record<string, unknown>[]).map((r) => {
    const committedUsd = BigInt(toStr(r.committed_amount_usd_minor));
    const drawnUsd = BigInt(toStr(r.drawn_usd_minor));
    const remaining =
      committedUsd > drawnUsd ? committedUsd - drawnUsd : 0n;
    const drawnPercent =
      committedUsd > 0n ? Number((drawnUsd * 10000n) / committedUsd) / 100 : 0;
    return {
      id: String(r.id),
      commitmentCode: String(r.commitment_code),
      investorId: String(r.investor_id),
      investorCode: String(r.investor_code),
      investorLegalName: String(r.investor_legal_name),
      investorType: r.investor_type as CommitmentListItem["investorType"],
      projectId: r.project_id ? String(r.project_id) : null,
      projectName: r.project_name ? String(r.project_name) : null,
      projectSlug: r.project_slug ? String(r.project_slug) : null,
      committedAmountMinor: toStr(r.committed_amount_minor),
      committedCurrency:
        r.committed_currency as CommitmentListItem["committedCurrency"],
      committedAmountUsdMinor: toStr(r.committed_amount_usd_minor),
      fxRateAtCommitment: toStr(r.fx_rate_at_commitment),
      profitSharePercent: toStr(r.profit_share_percent),
      capitalReturnPriority: toNum(r.capital_return_priority),
      isLandownerJv: Boolean(r.is_landowner_jv),
      status: r.status as CommitmentListItem["status"],
      signedAt: r.signed_at ? String(r.signed_at) : null,
      drawnUsdMinor: drawnUsd.toString(),
      remainingUsdMinor: remaining.toString(),
      drawnPercent,
      walletAvailableUsdMinor: toStr(r.wallet_available_usd_minor),
    };
  });
}
