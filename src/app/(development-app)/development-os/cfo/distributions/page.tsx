import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Phase 2.2 dev-02 — Distributions stub.
 *
 * Per spec the distributions surface is deferred to Phase 2.4
 * (investor cabinet). This route exists so the IA is honest and
 * `/cfo/distributions` resolves to a "coming Q3" placeholder
 * instead of 404ing.
 *
 * Pixel-redesign (cabinets/dev-p1/cfo.html lineage): legacy
 * PageHeader/Button/DevelopmentShell swapped for the dev `.page-header`
 * brick + `.btn` lineage. EmptyState stub copy preserved verbatim.
 */

export const metadata: Metadata = { title: "Distributions · Development OS" };
export const dynamic = "force-dynamic";

export default async function DistributionsStubPage() {
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/cfo">CFO</Link>
            <span>·</span>
            <span>Coming Q3 2026</span>
          </div>
          <h1>Distributions</h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Distribution waterfalls, preferred-return tracking, and IRR
            reporting land alongside the investor cabinet in Phase 2.4.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/cfo" className="btn btn-secondary btn-sm">
            ← CFO console
          </Link>
        </div>
      </div>

      <EmptyState
        variant="first-run"
        title="Distributions land in Phase 2.4"
        body="We're shipping CFO essentials (capital calls + cashflow) first. Distribution math (preferred return, catch-up, carry) needs the investor cabinet's commitment model — both arrive together next quarter."
      />
    </>
  );
}
