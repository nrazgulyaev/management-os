import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Phase 2.2 dev-02 — Distributions stub.
 *
 * Per spec the distributions surface is deferred to Phase 2.4
 * (investor cabinet). This route exists so the IA is honest and
 * `/cfo/distributions` resolves to a "coming Q3" placeholder
 * instead of 404ing.
 */

export const metadata: Metadata = { title: "Distributions · Development OS" };
export const dynamic = "force-dynamic";

export default async function DistributionsStubPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "CFO", href: "/development-os/cfo" },
          { label: "Distributions" },
        ]}
        eyebrow="Coming Q3 2026"
        title="Distributions"
        description="Distribution waterfalls, preferred-return tracking, and IRR reporting land alongside the investor cabinet in Phase 2.4."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/cfo">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              CFO console
            </Link>
          </Button>
        }
      />
      <EmptyState
        variant="first-run"
        title="Distributions land in Phase 2.4"
        body="We're shipping CFO essentials (capital calls + cashflow) first. Distribution math (preferred return, catch-up, carry) needs the investor cabinet's commitment model — both arrive together next quarter."
      />
    </DevelopmentShell>
  );
}
