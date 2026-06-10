import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
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
        <PageHeader title="Installments" />
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

  const outstandingPlans = rows.filter((r) => Number(r.outstandingUsdMinor) > 0).length;
  const overduePlans = rows.filter((r) => r.overdueCount > 0).length;
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Installments" },
        ]}
        eyebrow={`${outstandingPlans} with balance · ${overduePlans} overdue · ${autoOn} auto-remind on`}
        title="Buyers & installments"
        description="Operator payment desk for every buyer's installment plan. Each row is one contract group: track stage and paid progress, open a buyer to mark milestones paid or remind per line, toggle auto-reminders, or select plans and send reminders in bulk. Mark-paid is manual (no card capture)."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="w-5 h-5" strokeWidth={1.75} />}
          title="No installment plans yet"
          description="Plans appear once a reservation converts to a contract group with a milestone schedule."
        />
      ) : (
        <>
          <Section eyebrow="At a glance" title="Receivables">
            <InstallmentDeskKpis
              contractedUsdMinor={contractedTotal}
              outstandingUsdMinor={outstandingTotal}
              overdueCount={overduePayments}
              autoRemindOn={autoOn}
            />
          </Section>

          <Section eyebrow="Payment desk" title={`${rows.length} installment plan${rows.length === 1 ? "" : "s"}`}>
            <InstallmentDesk plans={rows} />
          </Section>
        </>
      )}
    </DevelopmentShell>
  );
}
