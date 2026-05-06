import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getCommitments } from "@/lib/development/server/investors";
import {
  COMMITMENT_STATUS_LABEL,
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Commitments · Development OS" };
export const dynamic = "force-dynamic";

export default async function CommitmentsPage() {
  const db = getDb();

  const commitments = db
    ? await safeQuery(
        "getCommitments",
        getCommitments({}),
        [] as Awaited<ReturnType<typeof getCommitments>>,
        4000,
      )
    : [];

  const totalCommittedUsd = commitments.reduce(
    (acc, c) => acc + BigInt(c.committedAmountUsdMinor),
    0n,
  );
  const totalDrawnUsd = commitments.reduce(
    (acc, c) => acc + BigInt(c.drawnUsdMinor),
    0n,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Commitments" },
        ]}
        eyebrow={
          db
            ? `${commitments.length} commitments · ${formatUsdMinor(totalCommittedUsd)} committed · ${formatUsdMinor(totalDrawnUsd)} drawn`
            : "Database not configured"
        }
        title="Capital commitments"
        description="One row per investor × project. Each commitment carries its own profit-share % and capital-return priority. Drawdowns and wallets nest under the detail view."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {!db && (
        <EmptyState
          title="Commitments need the database"
          description="Set DATABASE_URL and run npm run db:seed:dev-os."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      )}

      {db && (
        <Section eyebrow="All commitments" title="Active + closed">
          {commitments.length === 0 ? (
            <EmptyState
              title="No commitments yet"
              description="Run npm run db:seed:dev-os to populate the demo commitments, or use the API to add new ones."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Investor</TH>
                  <TH>Project</TH>
                  <TH>Committed</TH>
                  <TH>Profit %</TH>
                  <TH>Priority</TH>
                  <TH>Drawn</TH>
                  <TH>Drawn %</TH>
                  <TH>In wallet</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {commitments.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-xs">
                      <Link
                        href={`/development-os/commitments/${c.id}`}
                        className="hover:underline"
                      >
                        {c.commitmentCode}
                      </Link>
                    </TD>
                    <TD>
                      <Link
                        href={`/development-os/investors/${c.investorCode}`}
                        className="hover:underline text-sm"
                      >
                        {c.investorLegalName}
                      </Link>
                    </TD>
                    <TD className="text-xs">
                      {c.projectName ?? (
                        <span className="text-ink-tertiary">Multi-project</span>
                      )}
                    </TD>
                    <TDNum>
                      {formatCurrencyMinor(
                        BigInt(c.committedAmountMinor),
                        c.committedCurrency,
                      )}
                      <div className="text-[10px] text-ink-tertiary">
                        ≈ {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}
                      </div>
                    </TDNum>
                    <TDNum>{Number(c.profitSharePercent).toFixed(1)}%</TDNum>
                    <TDNum>{c.capitalReturnPriority}</TDNum>
                    <TDNum>{formatUsdMinor(BigInt(c.drawnUsdMinor))}</TDNum>
                    <TDNum>{c.drawnPercent.toFixed(1)}%</TDNum>
                    <TDNum>
                      {formatUsdMinor(BigInt(c.walletAvailableUsdMinor))}
                    </TDNum>
                    <TD>
                      <Badge
                        tone={
                          c.status === "active"
                            ? "success"
                            : c.status === "fully_called"
                              ? "info"
                              : c.status === "closed"
                                ? "neutral"
                                : "warning"
                        }
                      >
                        {COMMITMENT_STATUS_LABEL[c.status]}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Section>
      )}
    </DevelopmentShell>
  );
}
