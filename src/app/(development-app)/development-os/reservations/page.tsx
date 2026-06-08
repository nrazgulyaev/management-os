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
import { getDb } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema/contacts";
import { villas, projects } from "@/lib/db/schema/projects";
import { eq } from "drizzle-orm";
import { safeQuery } from "@/lib/development/safe-query";
import { ReservationModalForm } from "@/components/development/sales/reservation-modal-form";
import { ExportButton } from "@/components/development/bulk-import/export-button";
import { ReservationRowActions } from "./_row-actions";
import { ContractModalForm } from "@/components/development/sales/contract-modal-form";
import {
  getContractTemplates,
  getSalesSchemes,
} from "@/lib/development/server/contracts";

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
  const db = getDb();
  const [reservations, contactRows, villaRows, templates, schemes] = await Promise.all([
    // STAB-2 fix: getReservations() was unwrapped while the sibling
    // queries on this same page were protected by safeQuery with a
    // 4000ms timeout. When the reservations join hung at the DB
    // level, the whole /development-os/reservations page hung
    // indefinitely (curl times out at 30s, Playwright never gets
    // domcontentloaded). Wrapping it in the same safeQuery pattern
    // makes the page render with an empty list rather than blocking.
    safeQuery("getReservations", getReservations(), [], 4000),
    db
      ? safeQuery(
          "contacts list",
          db
            .select({ id: contacts.id, fullName: contacts.fullName, email: contacts.email })
            .from(contacts)
            .orderBy(contacts.fullName),
          [],
          4000,
        )
      : Promise.resolve([]),
    db
      ? safeQuery(
          "villas-with-project list",
          db
            .select({
              id: villas.id,
              unitCode: villas.unitCode,
              name: villas.name,
              projectId: villas.projectId,
              projectName: projects.name,
            })
            .from(villas)
            .innerJoin(projects, eq(projects.id, villas.projectId))
            .orderBy(villas.unitCode),
          [],
          4000,
        )
      : Promise.resolve([]),
    safeQuery("contract templates", getContractTemplates(), [], 4000),
    safeQuery("sales schemes", getSalesSchemes(), [], 4000),
  ]);
  const templateOptions = templates.map((t) => ({ id: t.id, name: t.name }));
  const schemeOptions = schemes.map((s) => ({ id: s.id, name: s.name }));
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
          <div className="flex items-center gap-2">
            <ReservationModalForm contacts={contactRows} villas={villaRows} />
            <ExportButton entity="reservations" />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
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
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Actions</th>
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
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-2">
                          <ReservationRowActions
                            reservationId={r.id}
                            status={r.status}
                            expiresAt={
                              r.expiresAt
                                ? new Date(r.expiresAt).toISOString()
                                : null
                            }
                          />
                          {r.status === "active" && (
                            <ContractModalForm
                              reservationId={r.id}
                              reservationLabel={`${r.contactFullName} · ${r.villaCode}`}
                              contractTemplates={templateOptions}
                              salesSchemes={schemeOptions}
                              suggestedTotalUsd={
                                Number(r.priceLockedUsdMinor) / 100
                              }
                            />
                          )}
                        </div>
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
