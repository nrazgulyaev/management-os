import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { NumKpi } from "@/components/projects/num-kpi";

/**
 * Phase 2.2 mgmt-01 — Booking charge detail · refund flow.
 *
 * Direct-link surface for a specific charge on a booking. Shows
 * the charge breakdown + a "Refund this charge" CTA that opens the
 * RefundChargeModal (wired in 2.2 data once the charges table is
 * available).
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; chargeId: string }>;
}): Promise<Metadata> {
  const { chargeId } = await params;
  return { title: `Charge ${chargeId}` };
}

export default async function BookingChargePage({
  params,
}: {
  params: Promise<{ id: string; chargeId: string }>;
}) {
  const { id, chargeId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: id, href: `/dashboard/bookings/${id}` },
          { label: "Charges" },
          { label: chargeId },
        ]}
        eyebrow="Charge detail"
        title={`Charge ${chargeId}`}
        description="Single-line view of a booking charge — original amount, status, source PO, refund history. Real data lands once the charges table is wired in 2.2."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/dashboard/bookings/${id}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to booking
            </Link>
          </Button>
        }
      />

      <div className="cfo-detail-kpis">
        <NumKpi label="Amount" value="USD 1,200" tone="accent" />
        <NumKpi label="Kind" value="Damage" />
        <NumKpi label="Status" value="Captured" tone="ok" />
        <NumKpi label="Refunded" value="USD 0" />
      </div>

      <div className="rounded-md border border-line-soft bg-surface p-5">
        <span className="text-label">Refund</span>
        <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
          The Refund button opens the destructive confirmation flow (full or
          partial · with reason). Once the charges table lands in 2.2 data,
          the actual refund posts through the originating payment provider.
        </p>
        <button className="btn btn-danger btn-sm mt-3" disabled>
          Refund this charge
        </button>
      </div>
    </div>
  );
}
