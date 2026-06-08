import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { CapitalCallCard } from "@/components/cfo/capital-call-card";
import { EmptyState } from "@/components/ui/empty-state";
import { loadCfoCapitalCalls } from "@/lib/development/server/investor/cfo-capital-call-reads";

/**
 * Phase 2.2 dev-02 — Capital calls list.
 *
 * Renders one CapitalCallCard per call. De-mocked in W1B: rows now come
 * from `capital_calls` (+ `capital_call_allocations`) via
 * loadCfoCapitalCalls. Empty-state shown when there are no active
 * (non-cancelled) calls or the DB is unavailable.
 */

export const metadata: Metadata = { title: "Capital calls · Development OS" };
export const dynamic = "force-dynamic";

export default async function CapitalCallsListPage() {
  const calls = await loadCfoCapitalCalls();
  const count = calls.length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "CFO", href: "/development-os/cfo" },
          { label: "Capital calls" },
        ]}
        eyebrow={`${count} capital ${count === 1 ? "call" : "calls"}`}
        title="Capital calls"
        description="Active + recent calls across every project. Partial-receipt tracking shows the percent paid + how many investors have wired."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/cfo">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              CFO console
            </Link>
          </Button>
        }
      />
      {count === 0 ? (
        <EmptyState
          variant="caught-up"
          title="No active capital calls"
          body="Calls drafted by the capital-call-drafter agent, or issued by finance, will appear here."
        />
      ) : (
        <div className="capital-calls-list">
          {calls.map((c) => (
            <CapitalCallCard
              key={c.id}
              href={`/development-os/cfo/capital-calls/${c.id}`}
              ref={c.ref}
              projectLabel={c.projectLabel}
              totalUsdMinor={c.totalUsdMinor}
              receivedUsdMinor={c.receivedUsdMinor}
              investorsPaid={c.investorsPaid}
              investorsTotal={c.investorsTotal}
              status={c.status}
              issuedAt={c.issuedAt}
            />
          ))}
        </div>
      )}
    </DevelopmentShell>
  );
}
