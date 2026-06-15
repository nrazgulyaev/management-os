import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listInstallmentPlans } from "@/lib/development/server/installments";
import { InstallmentDesk } from "@/components/development/installments/installment-desk";
import { InstallmentDeskKpis } from "@/components/development/installments/installment-desk-kpis";

export const metadata: Metadata = { title: "Installments · Development OS" };
export const dynamic = "force-dynamic";

export default async function InstallmentsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <span>Installments</span>
            </div>
            <h1>Installments</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const plans = await listInstallmentPlans();

  // Serialise bigint money to strings for the client desk.
  const rows = plans.map((p) => ({
    ...p,
    totalContractValueUsdMinor: p.totalContractValueUsdMinor.toString(),
    expectedTotalUsdMinor: p.expectedTotalUsdMinor.toString(),
    paidTotalUsdMinor: p.paidTotalUsdMinor.toString(),
    outstandingUsdMinor: p.outstandingUsdMinor.toString(),
  }));

  const autoOn = rows.filter((r) => r.autoRemindEnabled).length;

  // KPI strip aggregates (mock: Contracted / Due / Overdue / Auto-remind).
  // Money summed as USD MINOR bigint to avoid float drift, then stringified.
  const contractedTotal = rows
    .reduce((sum, r) => sum + BigInt(r.totalContractValueUsdMinor), 0n)
    .toString();
  const outstandingTotal = rows
    .reduce((sum, r) => sum + BigInt(r.outstandingUsdMinor), 0n)
    .toString();
  const overduePayments = rows.reduce((sum, r) => sum + r.overdueCount, 0);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Installments</span>
          </div>
          <h1>Buyers &amp; installments</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Operator payment desk for every buyer&apos;s installment plan. Each
            row is one contract group: track stage and paid progress, open a
            buyer to mark milestones paid or remind per line, toggle
            auto-reminders, or select plans and send reminders in bulk.
            Mark-paid is manual (no card capture).
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="w-5 h-5" strokeWidth={1.75} />}
          title="No installment plans yet"
          description="Plans appear once a reservation converts to a contract group with a milestone schedule."
        />
      ) : (
        <>
          <div>
            <div className="label mb-2.5">At a glance</div>
            <InstallmentDeskKpis
              contractedUsdMinor={contractedTotal}
              outstandingUsdMinor={outstandingTotal}
              overdueCount={overduePayments}
              autoRemindOn={autoOn}
            />
          </div>

          <div>
            <div className="label mb-2.5">Payment desk</div>
            <InstallmentDesk plans={rows} />
          </div>
        </>
      )}
    </DevelopmentShell>
  );
}
