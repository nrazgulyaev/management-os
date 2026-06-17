import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getInvestor } from "@/lib/development/server/investors";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { getInvestorDrafts } from "@/lib/development/server/investor-qa-actions";
import { InvestorQaPanel } from "@/components/development/investors/investor-qa-panel";
import { CommitmentModalForm } from "@/components/development/investors/commitment-modal-form";
import {
  COMMITMENT_STATUS_LABEL,
  CURRENCY_LABEL,
  INVESTOR_STATUS_LABEL,
  INVESTOR_TYPE_LABEL,
  REPORTING_LANGUAGE_LABEL,
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Investor detail · Development OS",
};
export const dynamic = "force-dynamic";

export default async function InvestorDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  const investor = db ? await getInvestor(decodeURIComponent(code)) : null;

  if (!investor) {
    if (!db) {
      return (
        <DevelopmentShell>
          <div className="page-header">
            <div className="left">
              <div className="crumb">
                <Link href="/development-os">Development OS</Link> /{" "}
                <Link href="/development-os/investors">Investors</Link> /{" "}
                <span>Detail</span>
              </div>
              <h1>Investor detail</h1>
            </div>
          </div>
          <EmptyState
            title="Database not configured"
            description="Set DATABASE_URL to view investor details."
            action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
          />
        </DevelopmentShell>
      );
    }
    notFound();
  }

  // Stage 3.B — Investor Q&A drafts (HITL).
  const qaDrafts = await getInvestorDrafts(investor.id, 20).catch(() => []);

  // Add-commitment modal: this investor is locked (single-element list), and
  // real DB projects are offered (the action org-scopes the project check).
  const projects = await getDevelopmentProjects().catch(() => []);
  const investorOption = [
    {
      id: investor.id,
      investorCode: investor.investorCode,
      legalName: investor.legalName,
    },
  ];
  const projectOptions = projects
    .filter((p) => p.source === "db")
    .map((p) => ({ id: p.realProjectId, name: p.name ?? p.slug }));

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/investors">Investors</Link> /{" "}
            <span>{investor.legalName}</span>
          </div>
          <div className="label">{`${investor.investorCode} · ${INVESTOR_TYPE_LABEL[investor.investorType]}`}</div>
          <h1>{investor.legalName}</h1>
          {investor.notes ? (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {investor.notes}
            </p>
          ) : null}
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link
                href={`/development-os/investors/${investor.investorCode}/grant-access`}
              >
                Portal access
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/investors">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                All investors
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Profile</div>
        <Card padding="default">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <ProfileField
              icon={<Mail className="w-3.5 h-3.5" />}
              label="Email"
              value={investor.contactEmail ?? "—"}
            />
            <ProfileField
              icon={<Phone className="w-3.5 h-3.5" />}
              label="Phone"
              value={investor.contactPhone ?? "—"}
            />
            <ProfileField
              icon={<Globe className="w-3.5 h-3.5" />}
              label="Tax residency"
              value={investor.taxResidency ?? "—"}
            />
            <ProfileField
              label="Reporting"
              value={`${CURRENCY_LABEL[investor.primaryCurrency]} · ${REPORTING_LANGUAGE_LABEL[investor.reportingLanguage]}`}
            />
          </div>
          <div className="mt-3">
            <HandoffBadge
              tone={
                investor.status === "active"
                  ? "ok"
                  : investor.status === "exited"
                    ? "soft"
                    : "warn"
              }
            >
              {INVESTOR_STATUS_LABEL[investor.status]}
            </HandoffBadge>
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Capital</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            label="Committed"
            value={formatUsdMinor(BigInt(investor.totalCommittedUsdMinor))}
            sub={`${investor.commitmentCount} commitments`}
            tone="accent"
          />
          <Kpi
            label="Drawn"
            value={formatUsdMinor(BigInt(investor.totalDrawnUsdMinor))}
            sub="Capital received"
          />
          <Kpi
            label="Distributed"
            value={formatUsdMinor(BigInt(investor.totalDistributedUsdMinor))}
            sub="Capital + profit"
            tone="success"
          />
          <Kpi
            label="In wallet"
            value={formatUsdMinor(BigInt(investor.walletAvailableTotalUsdMinor))}
            sub="Available to withdraw"
          />
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="label">Commitments</div>
          <CommitmentModalForm
            investors={investorOption}
            projects={projectOptions}
          />
        </div>
        {investor.commitments.length === 0 ? (
          <EmptyState
            title="No commitments yet"
            description="Open a capital commitment for this investor to start tracking capital calls, drawdowns, and distributions."
            action={
              <CommitmentModalForm
                investors={investorOption}
                projects={projectOptions}
              />
            }
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data w-full">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Project</th>
                    <th className="num">Committed</th>
                    <th className="num">Profit %</th>
                    <th className="num">Priority</th>
                    <th className="num">Drawn</th>
                    <th className="num">Drawn %</th>
                    <th className="num">In wallet</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {investor.commitments.map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono text-xs">
                        <Link
                          href={`/development-os/commitments/${c.id}`}
                          className="hover:underline"
                        >
                          {c.commitmentCode}
                        </Link>
                      </td>
                      <td>
                        {c.projectName ? (
                          <Link
                            href={`/development-os/projects/${c.projectSlug}`}
                            className="hover:underline text-xs"
                          >
                            {c.projectName}
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-3">
                            Multi-project
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {formatCurrencyMinor(
                          BigInt(c.committedAmountMinor),
                          c.committedCurrency,
                        )}
                        <div className="text-[10px] text-ink-4">
                          ≈ {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}
                        </div>
                      </td>
                      <td className="num">
                        {Number(c.profitSharePercent).toFixed(1)}%
                      </td>
                      <td className="num">{c.capitalReturnPriority}</td>
                      <td className="num">
                        {formatUsdMinor(BigInt(c.drawnUsdMinor))}
                      </td>
                      <td className="num">{c.drawnPercent.toFixed(1)}%</td>
                      <td className="num">
                        {formatUsdMinor(BigInt(c.walletAvailableUsdMinor))}
                      </td>
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
          </div>
        )}
      </div>

      <div>
        <div className="label mb-2.5">AI</div>
        <p className="text-[13px] text-ink-3 mb-3 max-w-[680px]">
          Paste an incoming question; the agent drafts a response using this
          investor&apos;s actual data. HITL: every draft must be approved (and
          optionally edited) before it&apos;s marked sent.
        </p>
        <InvestorQaPanel
          investorId={investor.id}
          investorReportingLanguage={investor.reportingLanguage}
          drafts={qaDrafts.map((d) => ({
            id: d.id,
            question: d.question,
            questionLanguage: d.questionLanguage,
            responseLanguage: d.responseLanguage,
            draftResponse: d.draftResponse,
            approvedResponse: d.approvedResponse,
            status: d.status as
              | "draft"
              | "approved"
              | "edited_approved"
              | "rejected"
              | "sent",
            sentAt: d.sentAt,
            sentVia: d.sentVia,
            generatedAt: d.generatedAt,
          }))}
        />
      </div>
    </DevelopmentShell>
  );
}

function ProfileField({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
