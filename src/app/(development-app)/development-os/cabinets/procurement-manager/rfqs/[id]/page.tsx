import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { RfqStatusPill } from "@/components/procurement/rfq-status-pill";
import { QuoteCompareClient } from "./_compare-client";
import type { QuoteCompareColumn } from "@/components/procurement/quote-compare";

/**
 * Phase 2.2 dev-04 — RFQ quote comparison.
 *
 * 3-vendor side-by-side with the vendor-matcher recommendation
 * banner below. Mock data today; real reads land in 2.2 data.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `RFQ ${id} · Quote compare` };
}

export default async function RfqCompareePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const columns: QuoteCompareColumn[] = [
    {
      vendorId: "v-marble-co",
      vendorName: "Marble Co.",
      vendorScore: 88,
      totalUsdMinor: 192_000_00,
      leadTimeDays: 32,
      warrantyMonths: 24,
      lines: [
        { code: "WP-04.18.a", description: "Karawang 60×60", total: 38_200 },
        { code: "WP-04.18.b", description: "Hindari 60×60", total: 52_100 },
        { code: "WP-04.19", description: "Adhesive grout", total: 12_400 },
      ],
      isWinner: true,
      savingsLabel: "Saves $24k vs runner-up",
    },
    {
      vendorId: "v-stone-island",
      vendorName: "Stone Island",
      vendorScore: 72,
      totalUsdMinor: 216_000_00,
      leadTimeDays: 28,
      warrantyMonths: 12,
      lines: [
        { code: "WP-04.18.a", description: "Karawang 60×60", total: 42_800 },
        { code: "WP-04.18.b", description: "Hindari 60×60", total: 58_900 },
      ],
    },
    {
      vendorId: "v-marbleworks",
      vendorName: "Marbleworks Bali",
      vendorScore: 60,
      totalUsdMinor: 245_000_00,
      leadTimeDays: 24,
      warrantyMonths: 18,
      lines: [
        { code: "WP-04.18.a", description: "Karawang 60×60", total: 48_900 },
        { code: "WP-04.18.b", description: "Hindari 60×60", total: 62_400 },
      ],
    },
  ];

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Procurement", href: "/development-os/cabinets/procurement-manager" },
          { label: `RFQ ${id}` },
        ]}
        eyebrow="3 quotes received · WP-04 marble package"
        title={`RFQ ${id}`}
        description="Three quotes received. The vendor-matcher agent has analyzed price + lead time + scorecard + project context — see recommendation below."
        actions={
          <div className="flex items-center gap-2">
            <RfqStatusPill status="quoting" />
            <Button asChild variant="secondary">
              <Link href="/development-os/cabinets/procurement-manager">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Procurement cabinet
              </Link>
            </Button>
          </div>
        }
      />
      <QuoteCompareClient
        rfqId={id}
        columns={columns}
        recommendation={{
          winnerVendorId: "v-marble-co",
          winnerName: "Marble Co.",
          winnerTotalUsd: 192_000,
          rationale:
            "Lowest price + highest scorecard (88). Lead time 32d still inside the WP-04 buffer; warranty 24mo doubles the runner-up.",
          confidence: 92,
        }}
      />
    </DevelopmentShell>
  );
}
