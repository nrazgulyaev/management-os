import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { formatDate, formatUSD } from "@/lib/utils";
import { getReservations } from "@/lib/development/server/reservations";
import { RESERVATION_STATUS_LABEL } from "@/lib/development/constants/payment-constants";
import type { ReservationStatus } from "@/lib/development/types/reservations";

export const metadata: Metadata = { title: "Reservations · Development OS" };
export const dynamic = "force-dynamic";

const statusTone: Record<ReservationStatus, "accent" | "gold" | "warning" | "danger" | "neutral" | "success"> = {
  pending_payment: "warning",
  active: "accent",
  expired: "neutral",
  converted_to_contract: "success",
  cancelled: "neutral",
  refunded: "neutral",
};

function fmtUsd(minor: bigint): string {
  return formatUSD(Number(minor) / 100);
}

export default async function ReservationsPage() {
  const reservations = await getReservations();
  const active = reservations.filter(
    (r) => r.status === "active" || r.status === "pending_payment",
  );
  const expiringSoon = active.filter((r) => {
    if (!r.expiresAt) return false;
    const days =
      (new Date(r.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days <= 5;
  });
  const converted = reservations.filter(
    (r) => r.status === "converted_to_contract",
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Reservations" },
        ]}
        eyebrow={`${active.length} active · ${expiringSoon.length} expiring soon · ${converted.length} converted`}
        title="Reservations"
        description="Deposit-locked unit reservations. Each reservation locks the unit's market price and holds the villa for the configured timeout. Convert to a contract group when the buyer signs."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {reservations.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="w-5 h-5" strokeWidth={1.75} />}
          title="No reservations yet"
          description="Reservations are created from a qualified lead — open the lead detail page and click Create reservation."
        />
      ) : (
        <Section eyebrow="All reservations" title={`${reservations.length} records`}>
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b border-line-soft text-left">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Buyer</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Unit</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Price locked</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Fee</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Expires</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-ink">{r.contactFullName}</span>
                          <span className="text-xs text-ink-tertiary">
                            {r.contactEmail ?? r.contactPhone ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-ink-tertiary">
                            {r.villaCode}
                          </span>
                          <span className="text-xs text-ink-secondary">
                            {r.projectName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">
                        {fmtUsd(r.priceLockedUsdMinor)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-secondary">
                        {fmtUsd(r.reservationFeeUsdMinor)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.expiresAt ? formatDate(r.expiresAt, "short") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone[r.status]}>
                          {RESERVATION_STATUS_LABEL[r.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}
