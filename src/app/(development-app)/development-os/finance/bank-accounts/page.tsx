import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Bank accounts" },
        ]}
        eyebrow={`${accounts.length} active accounts`}
        title="Bank accounts"
        description="Company bank accounts and crypto wallets that hold capital. Each account has a manual minimum-balance threshold; the balance-alert cron fires when it dips below."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/finance">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Finance
              </Link>
            </Button>
            <BankAccountModalForm projects={projectOptions} />
          </div>
        }
      />

      <FinanceTabs />

      {!db ? (
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to view bank accounts."
        />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Run npm run db:seed:dev-os to populate, or use the createBankAccount action to add one."
        />
      ) : (
        <Section eyebrow="Accounts" title="All active">
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
                  <Badge tone={a.belowThreshold ? "danger" : "success"}>
                    {a.belowThreshold ? "Below threshold" : "OK"}
                  </Badge>
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
        </Section>
      )}
    </DevelopmentShell>
  );
}
