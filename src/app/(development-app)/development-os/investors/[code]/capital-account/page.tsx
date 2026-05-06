import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getInvestor } from "@/lib/development/server/investors";
import {
  getInvestorCapitalAccount,
  listWalletMovements,
} from "@/lib/development/server/capital-account/capital-account-queries";
import { listInvestorResidualShares } from "@/lib/development/server/residual-inventory/residual-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Capital account · Development OS",
};
export const dynamic = "force-dynamic";

const MOVEMENT_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  capital_contribution: "info",
  capital_return: "success",
  profit_distribution: "success",
  reinvestment_out: "warning",
  reinvestment_in: "info",
  withdrawal_request: "warning",
  withdrawal_executed: "warning",
  manual_adjustment: "neutral",
  residual_inventory_realloc: "neutral",
};

function fmtUsd(b: bigint | string | number | null): string {
  if (b == null) return "—";
  const n = typeof b === "bigint" ? Number(b) : Number(b);
  return `$${(n / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function CapitalAccountPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Capital account" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const investor = await getInvestor(decodeURIComponent(code));
  if (!investor) notFound();

  const [account, movements, residual] = await Promise.all([
    safeQuery(
      "getInvestorCapitalAccount",
      getInvestorCapitalAccount(investor.id),
      { wallets: [], totals: { cash: 0, economic: 0, reinvestment: 0, committed: 0, pendingDistribution: 0, residualInventory: 0 } },
      4000,
    ),
    safeQuery(
      "listWalletMovements",
      listWalletMovements({ investorId: investor.id, limit: 50 }),
      [],
      4000,
    ),
    safeQuery(
      "listInvestorResidualShares",
      listInvestorResidualShares(investor.id),
      [],
      4000,
    ),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Investors", href: "/development-os/investors" },
          {
            label: investor.investorCode,
            href: `/development-os/investors/${investor.investorCode}`,
          },
          { label: "Capital account" },
        ]}
        eyebrow={`${account.wallets.length} wallet${account.wallets.length === 1 ? "" : "s"}`}
        title="Capital account"
        description="Aggregated balance buckets across this investor's wallets. Economic balance = cash + reinvestment + pending distribution + residual inventory value (recomputed nightly by dev_os_wallet_recompute)."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/investors/${investor.investorCode}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Investor
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Buckets" title="Aggregated balances (USD)">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Cash (available)" value={fmtUsd(account.totals.cash)} />
          <Stat
            label="Economic (incl. residual)"
            value={fmtUsd(account.totals.economic)}
          />
          <Stat label="Reinvestment earmark" value={fmtUsd(account.totals.reinvestment)} />
          <Stat label="Committed (open)" value={fmtUsd(account.totals.committed)} />
          <Stat
            label="Pending distribution"
            value={fmtUsd(account.totals.pendingDistribution)}
          />
          <Stat
            label="Residual inventory value"
            value={fmtUsd(account.totals.residualInventory)}
          />
        </div>
      </Section>

      <Section
        eyebrow="Activity"
        title={`Recent movements (${movements.length})`}
      >
        {movements.length === 0 ? (
          <EmptyState
            title="No wallet movements yet"
            description="Movements appear here as soon as the first contribution / distribution / withdrawal lands."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Bucket</TH>
                <TH>Amount</TH>
                <TH>Status</TH>
                <TH>Reason</TH>
              </TR>
            </THead>
            <TBody>
              {movements.map((m) => (
                <TR key={m.id}>
                  <TD className="text-xs">
                    {new Date(m.effectedAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </TD>
                  <TD>
                    <Badge tone={MOVEMENT_TONE[m.movementType] ?? "neutral"}>
                      {m.movementType}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{m.affectsBalance}</TD>
                  <TDNum
                    className={
                      Number(m.amountMinor) >= 0 ? "text-success" : "text-warning"
                    }
                  >
                    {Number(m.amountMinor) >= 0 ? "+" : ""}
                    {fmtUsd(m.amountMinor)}
                  </TDNum>
                  <TD className="text-xs">{m.status}</TD>
                  <TD className="text-xs max-w-[280px] truncate">{m.reason ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {residual.length > 0 && (
        <Section
          eyebrow="Residual"
          title={`Residual unit shares (${residual.length})`}
        >
          <Table>
            <THead>
              <TR>
                <TH>Unit</TH>
                <TH>Ownership %</TH>
                <TH>Economic claim</TH>
                <TH>Method</TH>
                <TH>Approved</TH>
              </TR>
            </THead>
            <TBody>
              {residual.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/residual-inventory/${r.residualUnitId}`}
                      className="hover:underline"
                    >
                      {r.residualUnitId.slice(0, 8)}
                    </Link>
                  </TD>
                  <TDNum>{Number(r.ownershipPercentage).toFixed(2)}%</TDNum>
                  <TDNum>{fmtUsd(r.economicClaimMinor)}</TDNum>
                  <TD className="text-xs">{r.settlementMethod}</TD>
                  <TD>
                    {r.isApproved ? (
                      <Badge tone="success">approved</Badge>
                    ) : (
                      <Badge tone="warning">pending</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface px-4 py-3 flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      <span className="text-sm text-ink font-mono tabular-nums">{value}</span>
    </div>
  );
}
