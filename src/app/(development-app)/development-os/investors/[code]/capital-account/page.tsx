import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getInvestor } from "@/lib/development/server/investors";
import {
  getInvestorCapitalAccount,
  listWalletMovements,
} from "@/lib/development/server/capital-account/capital-account-queries";
import { listInvestorResidualShares } from "@/lib/development/server/residual-inventory/residual-queries";
import { safeQuery } from "@/lib/development/safe-query";
import {
  CapitalAccountControls,
  ReverseMovementButton,
  type WalletOption,
} from "./_controls";

export const metadata: Metadata = {
  title: "Capital account · Development OS",
};
export const dynamic = "force-dynamic";

/** Movement type → handoff `.badge-*` class (dev palette). */
const MOVEMENT_BADGE: Record<string, string> = {
  capital_contribution: "badge-steel",
  capital_return: "badge-ok",
  profit_distribution: "badge-ok",
  reinvestment_out: "badge-warn",
  reinvestment_in: "badge-steel",
  withdrawal_request: "badge-warn",
  withdrawal_executed: "badge-warn",
  manual_adjustment: "badge-soft",
  residual_inventory_realloc: "badge-soft",
};

/** Mock `.iv-sec` — mono uppercase eyebrow with a trailing hairline rule. */
function SectionRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 mb-3 flex items-center gap-2.5">
      <span className="label text-[10.5px]">{children}</span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

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
        <div className="page-header">
          <div className="left">
            <h1>Capital account</h1>
          </div>
        </div>
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

  // Enrich each wallet with its commitment's project (from the investor
  // detail already loaded above) so the movement forms can label wallets and
  // resolve source/target projects for cross-project moves — no extra reader.
  const commitmentById = new Map(
    investor.commitments.map((c) => [c.id, c]),
  );
  const walletOptions: WalletOption[] = account.wallets.map((w) => {
    const c = w.commitmentId ? commitmentById.get(w.commitmentId) : undefined;
    const projectLabel = c?.projectName ?? "Company-level";
    return {
      walletId: w.id,
      label: c
        ? `${c.commitmentCode} · ${projectLabel}`
        : `Wallet ${w.id.slice(0, 8)}`,
      projectId: c?.projectId ?? null,
      projectName: c?.projectName ?? null,
    };
  });

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/investors">Investors</Link> /{" "}
            <Link href={`/development-os/investors/${investor.investorCode}`}>
              {investor.investorCode}
            </Link>{" "}
            / <span>Capital account</span>
          </div>
          <div className="label">{`${account.wallets.length} wallet${account.wallets.length === 1 ? "" : "s"}`}</div>
          <h1>Capital account</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Aggregated balance buckets across this investor&apos;s wallets.
            Economic balance = cash + reinvestment + pending distribution +
            residual inventory value (recomputed nightly by
            dev_os_wallet_recompute).
          </p>
        </div>
        <div className="actions">
          <CapitalAccountControls
            code={investor.investorCode}
            investorId={investor.id}
            wallets={walletOptions}
          />
          <Button asChild variant="secondary">
            <Link href={`/development-os/investors/${investor.investorCode}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Investor
            </Link>
          </Button>
        </div>
      </div>

      <SectionRule>Buckets · aggregated balances (USD)</SectionRule>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Cash (available)" value={fmtUsd(account.totals.cash)} />
        <Kpi
          label="Economic (incl. residual)"
          value={fmtUsd(account.totals.economic)}
          tone="accent"
        />
        <Kpi
          label="Reinvestment earmark"
          value={fmtUsd(account.totals.reinvestment)}
        />
        <Kpi label="Committed (open)" value={fmtUsd(account.totals.committed)} />
        <Kpi
          label="Pending distribution"
          value={fmtUsd(account.totals.pendingDistribution)}
        />
        <Kpi
          label="Residual inventory value"
          value={fmtUsd(account.totals.residualInventory)}
        />
      </div>

      <SectionRule>{`Activity · recent movements (${movements.length})`}</SectionRule>
      {movements.length === 0 ? (
        <EmptyState
          title="No wallet movements yet"
          description="Movements appear here as soon as the first contribution / distribution / withdrawal lands."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Bucket</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="font-mono text-[11px]">
                      {new Date(m.effectedAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (MOVEMENT_BADGE[m.movementType] ?? "badge-soft")
                        }
                      >
                        {m.movementType}
                      </span>
                    </td>
                    <td className="text-xs">{m.affectsBalance}</td>
                    <td
                      className={
                        "num " +
                        (Number(m.amountMinor) >= 0 ? "text-ok" : "text-warning")
                      }
                    >
                      {Number(m.amountMinor) >= 0 ? "+" : ""}
                      {fmtUsd(m.amountMinor)}
                    </td>
                    <td className="text-xs">{m.status}</td>
                    <td className="max-w-[280px] truncate text-xs">
                      {m.reason ?? "—"}
                    </td>
                    <td className="text-right">
                      {m.status === "recorded" ? (
                        <ReverseMovementButton
                          code={investor.investorCode}
                          movementId={m.id}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {residual.length > 0 && (
        <>
          <SectionRule>{`Residual · unit shares (${residual.length})`}</SectionRule>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data w-full">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th className="num">Ownership %</th>
                    <th className="num">Economic claim</th>
                    <th>Method</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {residual.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs">
                        <Link
                          href={`/development-os/residual-inventory/${r.residualUnitId}`}
                          className="hover:underline"
                        >
                          {r.residualUnitId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="num">
                        {Number(r.ownershipPercentage).toFixed(2)}%
                      </td>
                      <td className="num">{fmtUsd(r.economicClaimMinor)}</td>
                      <td className="text-xs">{r.settlementMethod}</td>
                      <td>
                        {r.isApproved ? (
                          <span className="badge badge-ok">approved</span>
                        ) : (
                          <span className="badge badge-warn">pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </DevelopmentShell>
  );
}
