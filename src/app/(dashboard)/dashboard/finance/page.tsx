import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { FinanceSummary } from "@/components/dashboard/finance-summary";
import { PeriodPill } from "@/components/finance/period-pill";
import { Download, FileCheck2, Plus, ArrowUpRight } from "lucide-react";
import {
  getFinanceSummary,
  listOwnerStatements,
  listStatementPeriods,
} from "@/features/finance/services";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const summary = await getFinanceSummary();
  const periods = await listStatementPeriods();
  const recentStatements = (await listOwnerStatements()).slice(0, 6);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Finance" }]}
        eyebrow={summary?.currentPeriod?.label ?? "No period"}
        title="Finance"
        description="Live ledger, statement periods, owner statements, and queued payouts. The legacy mock statement is preserved below for design reference."
        actions={
          <div className="flex gap-2 items-center">
            <SourceBadge source={summary ? "db" : "mock"} />
            <Button asChild variant="secondary">
              <Link href="/dashboard/finance/periods">
                <FileCheck2 className="w-4 h-4" strokeWidth={1.75} />
                Periods
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/finance/statements">
                Statements
                <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              </Link>
            </Button>
          </div>
        }
      />

      <DbStatusNotice />

      {summary && summary.currentPeriod && (
        <Section
          eyebrow="Current period"
          title={summary.currentPeriod.label}
          description={`${summary.currentPeriod.periodStart} → ${summary.currentPeriod.periodEnd}`}
          action={<PeriodPill status={summary.currentPeriod.status} />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Gross revenue"
              value={formatMoneyMinor(summary.grossRevenueMinor, summary.currency, { compact: true })}
            />
            <MetricCard
              label="Fees"
              value={formatMoneyMinor(summary.feesMinor, summary.currency, { compact: true })}
              hint="OTA · payment · agent"
            />
            <MetricCard
              label="Operating expenses"
              value={formatMoneyMinor(summary.expensesMinor, summary.currency, { compact: true })}
            />
            <MetricCard
              label="Reserves contributed"
              value={formatMoneyMinor(summary.reservesContributedMinor, summary.currency, { compact: true })}
              hint="Renovation + FF&E"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <MetricCard
              label="Taxes"
              value={formatMoneyMinor(summary.taxesMinor, summary.currency, { compact: true })}
            />
            <MetricCard
              label="Pending payouts"
              value={formatMoneyMinor(summary.pendingPayoutsMinor, summary.currency, { compact: true })}
              hint={`${summary.pendingPayoutsCount} line${summary.pendingPayoutsCount === 1 ? "" : "s"}`}
            />
            <MetricCard label="Statements · draft" value={summary.draftStatements.toString()} />
            <MetricCard
              label="Statements · paid"
              value={summary.paidStatements.toString()}
              hint={`${summary.issuedStatements} issued`}
            />
          </div>
        </Section>
      )}

      <Section
        eyebrow="Quick actions"
        title="Add to the ledger"
        description="Each entry is checked against the active period's lock status before it persists."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { href: "/dashboard/finance/revenue/new", label: "Revenue" },
            { href: "/dashboard/finance/fees/new", label: "Fee" },
            { href: "/dashboard/finance/expenses/new", label: "Expense" },
            { href: "/dashboard/finance/taxes/new", label: "Tax" },
            { href: "/dashboard/finance/reserves/new", label: "Reserve" },
            { href: "/dashboard/finance/periods/new", label: "Period" },
            { href: "/dashboard/finance/payouts/new", label: "Payout batch" },
          ].map((q) => (
            <Button
              key={q.href}
              asChild
              variant="secondary"
              size="sm"
              className="justify-start"
            >
              <Link href={q.href}>
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                {q.label}
              </Link>
            </Button>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Statement periods"
        title="Period status"
        description="Closed and locked periods refuse new financial mutations at the database layer."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/finance/periods">All periods →</Link>
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {periods.length === 0 ? (
            <div className="text-sm text-ink-tertiary">
              No periods yet.{" "}
              <Link href="/dashboard/finance/periods/new" className="underline">
                Create the first one
              </Link>
              .
            </div>
          ) : (
            periods.slice(0, 6).map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/finance/periods/${p.id}`}
                className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2 hover:border-line-strong"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink font-medium">{p.label}</span>
                  <PeriodPill status={p.status} />
                </div>
                <span className="text-[11px] text-ink-tertiary">
                  {p.periodStart} → {p.periodEnd}
                </span>
              </Link>
            ))
          )}
        </div>
      </Section>

      <Section
        eyebrow="Statements"
        title="Recent owner statements"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/finance/statements">All statements →</Link>
          </Button>
        }
      >
        {recentStatements.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-soft p-8 text-center text-sm text-ink-tertiary">
            No statements yet. Generate one from{" "}
            <Link href="/dashboard/finance/statements/new" className="underline">
              /dashboard/finance/statements/new
            </Link>
            .
          </div>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden divide-y divide-line-soft">
            {recentStatements.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/finance/statements/${s.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/40"
              >
                <div>
                  <div className="text-sm text-ink font-medium">
                    {s.ownerName} · {s.villaCode ?? s.projectName ?? "—"}
                  </div>
                  <div className="text-[11px] text-ink-tertiary mt-0.5">
                    {s.periodLabel} · {s.managementModel}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono tabular-nums text-sm text-ink">
                    {formatMoneyMinor(s.netPayoutMinor, s.currency)}
                  </span>
                  <Badge
                    tone={
                      s.status === "paid"
                        ? "success"
                        : s.status === "draft"
                          ? "neutral"
                          : "info"
                    }
                  >
                    {s.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section
        eyebrow="Sample statement"
        title="An owner statement, exactly as published."
        description="Demo data from v2 — kept as a reference for the design language. Real DB-backed statements live above."
      >
        <FinanceSummary />
        <div className="mt-3 flex items-center justify-end">
          <Button variant="ghost" size="sm">
            <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
            Export sample
          </Button>
        </div>
      </Section>
    </div>
  );
}
