import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { CommitmentModalForm } from "@/components/development/investors/commitment-modal-form";
import { getDb } from "@/lib/db/client";
import { getCommitments, getInvestors } from "@/lib/development/server/investors";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import {
  COMMITMENT_STATUS_LABEL,
  COMMITMENT_STATUSES,
  type CommitmentStatus,
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Commitments · Development OS" };
export const dynamic = "force-dynamic";

/** Abbreviated USD for KPI tiles — `$12.4M` / `$1.1M`, matching the mockup. */
function fmtAbbrevUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}

export default async function CommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = (COMMITMENT_STATUSES as readonly string[]).includes(
    sp.status ?? "",
  )
    ? (sp.status as CommitmentStatus)
    : undefined;
  const q = (sp.q ?? "").trim().toLowerCase();

  const db = getDb();

  const [commitmentsAll, investors, projects] = db
    ? await Promise.all([
        safeQuery(
          "getCommitments",
          getCommitments({ status: statusFilter }),
          [] as Awaited<ReturnType<typeof getCommitments>>,
          4000,
        ),
        safeQuery(
          "getInvestors",
          getInvestors({}),
          [] as Awaited<ReturnType<typeof getInvestors>>,
          4000,
        ),
        safeQuery(
          "getDevelopmentProjects",
          getDevelopmentProjects(),
          [] as Awaited<ReturnType<typeof getDevelopmentProjects>>,
          4000,
        ),
      ])
    : [[], [], []];

  // Free-text search across commitment code, investor name, project — applied
  // to the org-scoped result set (no SQL change to the shared query).
  const commitments = q
    ? commitmentsAll.filter(
        (c) =>
          c.commitmentCode.toLowerCase().includes(q) ||
          (c.investorLegalName ?? "").toLowerCase().includes(q) ||
          (c.investorCode ?? "").toLowerCase().includes(q) ||
          (c.projectName ?? "").toLowerCase().includes(q),
      )
    : commitmentsAll;
  const hasFilters = Boolean(q || statusFilter);

  // Selects for the create-commitment modal. Investors carry id/code/name;
  // projects are filtered to real DB rows (a mock id can't be committed
  // against — the action org-scopes the project existence check).
  const investorOptions = investors.map((i) => ({
    id: i.id,
    investorCode: i.investorCode,
    legalName: i.legalName,
  }));
  const projectOptions = projects
    .filter((p) => p.source === "db")
    .map((p) => ({ id: p.realProjectId, name: p.name ?? p.slug }));

  const totalCommittedUsd = commitments.reduce(
    (acc, c) => acc + BigInt(c.committedAmountUsdMinor),
    0n,
  );
  const totalDrawnUsd = commitments.reduce(
    (acc, c) => acc + BigInt(c.drawnUsdMinor),
    0n,
  );
  const totalWalletUsd = commitments.reduce(
    (acc, c) => acc + BigInt(c.walletAvailableUsdMinor),
    0n,
  );
  const drawnPct =
    totalCommittedUsd > 0n
      ? Math.round((Number(totalDrawnUsd) / Number(totalCommittedUsd)) * 100)
      : 0;
  // Capital-weighted average profit-share %.
  const committedUsdNum = Number(totalCommittedUsd);
  const avgProfitPct =
    committedUsdNum > 0
      ? commitments.reduce(
          (acc, c) =>
            acc +
            Number(c.profitSharePercent) *
              (Number(c.committedAmountUsdMinor) / committedUsdNum),
          0,
        )
      : 0;

  return (
    <DevelopmentShell>
      <div className="section-heading">
        <div className="eyebrow label">Capital · one row per investor × project</div>
        <h1>
          Capital <em>commitments</em>.
        </h1>
        <p>
          Each commitment carries its own profit-share % and capital-return
          priority. Drawdowns and wallets nest under the detail view.
        </p>
      </div>

      <div className="flex justify-end gap-2 mb-[22px]">
        {db && (
          <CommitmentModalForm
            investors={investorOptions}
            projects={projectOptions}
          />
        )}
        <Link href="/development-os" className="btn btn-dark btn-sm">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Command center
        </Link>
      </div>

      {!db && (
        <EmptyState
          title="Commitments need the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      )}

      {db && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Committed"
              value={fmtAbbrevUsd(totalCommittedUsd)}
              sub={`${commitments.length} commitments`}
              tone="accent"
            />
            <Kpi
              label="Drawn"
              value={fmtAbbrevUsd(totalDrawnUsd)}
              sub={`${drawnPct}% called`}
            />
            <Kpi
              label="In wallets"
              value={fmtAbbrevUsd(totalWalletUsd)}
              sub="available"
              tone="success"
            />
            <Kpi
              label="Avg profit %"
              value={`${avgProfitPct.toFixed(1)}%`}
              sub="weighted"
            />
          </div>

          <form
            method="GET"
            action="/development-os/commitments"
            className="mt-5 flex flex-wrap items-center gap-2"
          >
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search code / investor / project…"
              aria-label="Search commitments"
              className="rounded-full border border-line bg-surface px-3.5 py-[6px] text-[12.5px] text-ink w-[240px] focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              aria-label="Status"
              className="rounded-full border border-line bg-surface px-3 py-[6px] text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">All statuses</option>
              {COMMITMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMMITMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-dark btn-sm">
              Apply
            </button>
            {hasFilters && (
              <Link
                href="/development-os/commitments"
                className="btn btn-secondary btn-sm"
              >
                Clear
              </Link>
            )}
          </form>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <span className="label">Active + closed</span>
              <span className="label">{commitments.length} commitments</span>
            </div>
            <div className="card overflow-hidden">
              {commitments.length === 0 ? (
                hasFilters ? (
                  <EmptyState
                    title="No commitments match"
                    description="No commitments match the current search or status filter. Clear them to see the full list."
                  />
                ) : (
                <EmptyState
                  title="No commitments yet"
                  description="Add your first investor commitment to start tracking capital calls and distributions."
                  action={
                    <CommitmentModalForm
                      investors={investorOptions}
                      projects={projectOptions}
                    />
                  }
                />
                )
              ) : (
                <div className="overflow-x-auto">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Investor</th>
                        <th>Project</th>
                        <th className="num">Committed</th>
                        <th className="num">Profit %</th>
                        <th className="num">Drawn %</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commitments.map((c) => (
                        <tr key={c.id}>
                          <td className="font-mono text-[11px]">
                            <Link
                              href={`/development-os/commitments/${c.id}`}
                              className="hover:underline"
                            >
                              {c.commitmentCode}
                            </Link>
                          </td>
                          <td className="row-title">
                            <Link
                              href={`/development-os/investors/${c.investorCode}`}
                              className="hover:underline"
                            >
                              {c.investorLegalName}
                            </Link>
                          </td>
                          <td className="text-ink-3">
                            {c.projectName ?? (
                              <span className="text-ink-4">Multi-project</span>
                            )}
                          </td>
                          <td className="num">
                            {formatCurrencyMinor(
                              BigInt(c.committedAmountMinor),
                              c.committedCurrency,
                            )}
                            <div className="text-[10px] text-ink-3">
                              ≈ {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}
                            </div>
                          </td>
                          <td className="num">
                            {Number(c.profitSharePercent).toFixed(1)}%
                          </td>
                          <td className="num">{c.drawnPercent.toFixed(1)}%</td>
                          <td>
                            <HandoffBadge
                              tone={
                                c.status === "active"
                                  ? "ok"
                                  : c.status === "fully_called"
                                    ? "info"
                                    : c.status === "closed"
                                      ? "soft"
                                      : "warn"
                              }
                            >
                              {COMMITMENT_STATUS_LABEL[c.status]}
                            </HandoffBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </DevelopmentShell>
  );
}
