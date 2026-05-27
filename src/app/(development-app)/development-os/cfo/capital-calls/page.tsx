import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { CapitalCallCard } from "@/components/cfo/capital-call-card";

/**
 * Phase 2.2 dev-02 — Capital calls list.
 *
 * Renders one CapitalCallCard per call. Today the data is mocked;
 * real reads against the `capital_calls` table land alongside the
 * data-wiring slice.
 */

export const metadata: Metadata = { title: "Capital calls · Development OS" };
export const dynamic = "force-dynamic";

const MOCK_CALLS = [
  {
    id: "cc-001",
    ref: "CC-EV02-2026-Q1",
    projectLabel: "Eternal Phase 02 · Foundation pour",
    totalUsdMinor: 800_000_00,
    receivedUsdMinor: 600_000_00,
    investorsPaid: 9,
    investorsTotal: 12,
    status: "partial" as const,
    issuedAt: "2026-01-12",
  },
  {
    id: "cc-002",
    ref: "CC-AH01-2026-Q1",
    projectLabel: "Ahau 01 · Finishes",
    totalUsdMinor: 320_000_00,
    receivedUsdMinor: 320_000_00,
    investorsPaid: 4,
    investorsTotal: 4,
    status: "received" as const,
    issuedAt: "2025-12-04",
  },
  {
    id: "cc-003",
    ref: "CC-EV08-2026-Q2-DRAFT",
    projectLabel: "Eternal Phase 08 · Mobilization",
    totalUsdMinor: 1_500_000_00,
    receivedUsdMinor: 0,
    investorsPaid: 0,
    investorsTotal: 14,
    status: "drafting" as const,
  },
];

export default async function CapitalCallsListPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "CFO", href: "/development-os/cfo" },
          { label: "Capital calls" },
        ]}
        eyebrow={`${MOCK_CALLS.length} capital calls`}
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
      <div className="capital-calls-list">
        {MOCK_CALLS.map((c) => (
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
    </DevelopmentShell>
  );
}
