import type { Metadata } from "next";
import Link from "next/link";
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
 *
 * Pixel-redesign (cabinets/dev-p1/cfo.html lineage): legacy
 * PageHeader/Button/DevelopmentShell swapped for the dev `.page-header`
 * brick + `.btn` lineage so this sub-route matches the redesigned CFO
 * console landing. Data wiring (loadCfoCapitalCalls) preserved verbatim.
 */

export const metadata: Metadata = { title: "Capital calls · Development OS" };
export const dynamic = "force-dynamic";

export default async function CapitalCallsListPage() {
  const calls = await loadCfoCapitalCalls();
  const count = calls.length;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/cfo">CFO</Link>
            <span>·</span>
            <span>{`${count} capital ${count === 1 ? "call" : "calls"}`}</span>
          </div>
          <h1>Capital calls</h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Active + recent calls across every project. Partial-receipt
            tracking shows the percent paid + how many investors have wired.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/cfo" className="btn btn-secondary btn-sm">
            ← CFO console
          </Link>
        </div>
      </div>

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
    </>
  );
}
