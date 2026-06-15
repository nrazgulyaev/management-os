import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getBankAccounts } from "@/lib/development/server/bank-accounts";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import {
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
import { BankAccountModalForm } from "@/components/development/finance/bank-account-modal-form";

export const metadata: Metadata = { title: "Bank accounts · Development OS" };
export const dynamic = "force-dynamic";

export default async function BankAccountsPage() {
  const db = getDb();
  const [accounts, projects] = await Promise.all([
    db
      ? safeQuery("getBankAccounts", getBankAccounts(), [], 4000)
      : Promise.resolve([]),
    db
      ? safeQuery("getDevelopmentProjects", getDevelopmentProjects(), [], 4000)
      : Promise.resolve([]),
  ]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Bank accounts</span>
          </div>
          <h1>Bank accounts</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Company bank accounts and crypto wallets that hold capital. Each
            account has a manual minimum-balance threshold; the balance-alert
            cron fires when it dips below.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/finance" className="btn btn-secondary">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Finance
          </Link>
          <BankAccountModalForm projects={projectOptions} />
        </div>
      </div>

      <FinanceTabs />

      {!db ? (
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to view bank accounts."
        />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add your first bank account to start reconciling statements."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Accounts</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={`/development-os/finance/bank-accounts/${a.id}`}
                className="rounded-lg border border-line-soft bg-surface p-4 hover:border-ink-tertiary transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-ink-tertiary">
                    {a.accountCode}
                  </span>
                  <HandoffBadge tone={a.belowThreshold ? "danger" : "ok"}>
                    {a.belowThreshold ? "Below threshold" : "OK"}
                  </HandoffBadge>
                </div>
                <div className="font-medium">{a.accountName}</div>
                <div className="text-xs text-ink-tertiary mt-1">
                  {a.accountType} · {a.currency}
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-medium tabular-nums">
                    {formatCurrencyMinor(
                      BigInt(a.currentBalanceMinor),
                      a.currency,
                    )}
                  </div>
                  <div className="text-xs text-ink-tertiary">
                    ≈ {formatUsdMinor(BigInt(a.currentBalanceUsdMinor))}
                  </div>
                </div>
                {a.minimumBalanceThresholdMinor && (
                  <div className="mt-3 text-[11px] text-ink-tertiary">
                    Threshold:{" "}
                    {formatCurrencyMinor(
                      BigInt(a.minimumBalanceThresholdMinor),
                      a.currency,
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </DevelopmentShell>
  );
}
