import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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

const statusTone: Record<ReservationStatus, "info" | "gold" | "warn" | "danger" | "soft" | "ok"> = {
  pending_payment: "warn",
  active: "info",
  expired: "soft",
  converted_to_contract: "ok",
  cancelled: "soft",
  refunded: "soft",
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Reservations</span>
          </div>
          <h1>Reservations</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Deposit-locked unit reservations. Each reservation locks the unit&apos;s
            market price and holds the villa for the configured timeout. Convert to
            a contract group when the buyer signs.
          </p>
          <div className="text-[12px] text-ink-3 mt-1.5">
            {active.length} active · {expiringSoon.length} expiring soon ·{" "}
            {converted.length} converted
          </div>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <ReservationModalForm contacts={contactRows} villas={villaRows} />
            <ExportButton entity="reservations" />
            <Link href="/development-os" className="btn btn-secondary">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </div>
        </div>
      </div>

      {reservations.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="w-5 h-5" strokeWidth={1.75} />}
          title="No reservations yet"
          description="Reservations are created from a qualified lead — open the lead detail page and click Create reservation."
        />
      ) : (
        <div>
          <div className="label mb-2.5">
            All reservations · {reservations.length} records
          </div>
          <Card padding="none" overflowHidden>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Buyer</th>
                    <th scope="col">Unit</th>
                    <th scope="col" className="num">Price locked</th>
                    <th scope="col" className="num">Fee</th>
                    <th scope="col">Expires</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="flex flex-col">
                          <span className="row-title">{r.contactFullName}</span>
                          <span className="text-xs text-ink-3">
                            {r.contactEmail ?? r.contactPhone ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span className="mono text-xs text-ink-3">
                            {r.villaCode}
                          </span>
                          <span className="text-xs text-ink-2">
                            {r.projectName}
                          </span>
                        </div>
                      </td>
                      <td className="num">{fmtUsd(r.priceLockedUsdMinor)}</td>
                      <td className="num text-ink-2">
                        {fmtUsd(r.reservationFeeUsdMinor)}
                      </td>
                      <td className="mono text-xs">
                        {r.expiresAt ? formatDate(r.expiresAt, "short") : "—"}
                      </td>
                      <td>
                        <HandoffBadge tone={statusTone[r.status]}>
                          {RESERVATION_STATUS_LABEL[r.status]}
                        </HandoffBadge>
                      </td>
                      <td>
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
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
