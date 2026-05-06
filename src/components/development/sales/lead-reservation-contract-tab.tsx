import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, FileSignature, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatUSD } from "@/lib/utils";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import { CONTRACT_GROUP_STATUS_LABEL } from "@/lib/development/constants/contracts-constants";
import { RESERVATION_STATUS_LABEL } from "@/lib/development/constants/payment-constants";
import type { ReservationListItem } from "@/lib/development/types/reservations";
import type { ContractGroupListItem } from "@/lib/development/types/contracts";

const reservationTone: Record<
  string,
  "neutral" | "accent" | "gold" | "warning" | "danger"
> = {
  pending_payment: "warning",
  active: "accent",
  expired: "neutral",
  converted_to_contract: "accent",
  cancelled: "neutral",
  refunded: "danger",
};

const groupTone: Record<
  string,
  "neutral" | "accent" | "gold" | "warning" | "danger" | "success"
> = {
  draft: "neutral",
  pending_signature: "gold",
  partial_signed: "gold",
  fully_signed: "accent",
  in_payment: "accent",
  completed: "success",
  cancelled: "neutral",
  breached: "danger",
};

function fmtUsd(minor: bigint) {
  return formatUSD(Number(minor) / 100);
}

export interface LeadReservationContractTabProps {
  leadStatus: string;
  reservations: ReservationListItem[];
  contractGroups: ContractGroupListItem[];
}

export function LeadReservationContractTab({
  leadStatus,
  reservations,
  contractGroups,
}: LeadReservationContractTabProps) {
  const hasAny = reservations.length > 0 || contractGroups.length > 0;
  const canCreate =
    leadStatus === "qualified" ||
    leadStatus === "viewing_scheduled" ||
    leadStatus === "viewing_completed" ||
    leadStatus === "negotiation";

  if (!hasAny) {
    return (
      <EmptyState
        icon={<KeyRound className="w-5 h-5" strokeWidth={1.75} />}
        title="No reservation or contract yet"
        description={
          canCreate
            ? "This lead is qualified — create a reservation from the Reservations workspace, or update the lead's pipeline status to 'reservation' first."
            : "Move the lead to 'qualified' first; the reservation flow opens once the lead is past discovery."
        }
        action={
          canCreate ? (
            <Button asChild>
              <Link href={`${DEVELOPMENT_APP_PATH}/reservations`}>
                Open reservations workspace
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {reservations.length > 0 && (
        <section className="flex flex-col gap-3">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink uppercase tracking-wide">
              Reservations · {reservations.length}
            </h3>
          </header>
          <ul className="flex flex-col gap-3">
            {reservations.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <KeyRound
                      className="w-4 h-4 text-ink-tertiary"
                      strokeWidth={1.75}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-ink">
                        {r.villaCode}
                        {r.villaName && (
                          <span className="text-ink-tertiary"> · {r.villaName}</span>
                        )}
                      </span>
                      <span className="text-[11px] text-ink-tertiary">
                        {r.projectName}
                      </span>
                    </div>
                  </div>
                  <Badge tone={reservationTone[r.status] ?? "neutral"}>
                    {RESERVATION_STATUS_LABEL[r.status as keyof typeof RESERVATION_STATUS_LABEL] ?? r.status}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <Stat label="Locked price" value={fmtUsd(r.priceLockedUsdMinor)} />
                  <Stat
                    label="Reservation fee"
                    value={fmtUsd(r.reservationFeeUsdMinor)}
                  />
                  <Stat
                    label="Paid"
                    value={r.paidAt ? formatDate(r.paidAt, "short") : "—"}
                  />
                  <Stat
                    label="Expires"
                    value={r.expiresAt ? formatDate(r.expiresAt, "short") : "—"}
                  />
                </dl>
                <div className="flex items-center justify-end gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`${DEVELOPMENT_APP_PATH}/reservations`}>
                      Manage
                      <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {contractGroups.length > 0 && (
        <section className="flex flex-col gap-3">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink uppercase tracking-wide">
              Contract groups · {contractGroups.length}
            </h3>
          </header>
          <ul className="flex flex-col gap-3">
            {contractGroups.map((g) => (
              <li
                key={g.id}
                className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileSignature
                      className="w-4 h-4 text-ink-tertiary"
                      strokeWidth={1.75}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-ink">
                        {g.villaCode}
                        {g.villaName && (
                          <span className="text-ink-tertiary"> · {g.villaName}</span>
                        )}
                      </span>
                      <span className="text-[11px] text-ink-tertiary">
                        {g.projectName} · {g.templateName}
                      </span>
                    </div>
                  </div>
                  <Badge tone={groupTone[g.status] ?? "neutral"}>
                    {CONTRACT_GROUP_STATUS_LABEL[g.status] ?? g.status}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <Stat
                    label="Total value"
                    value={fmtUsd(g.totalContractValueUsdMinor)}
                  />
                  <Stat label="FX at signing" value={g.fxRateAtSigning.toLocaleString("en-US")} />
                  <Stat
                    label="Date"
                    value={formatDate(g.contractDate, "short")}
                  />
                  <Stat
                    label="Fully signed"
                    value={g.fullySignedAt ? formatDate(g.fullySignedAt, "short") : "—"}
                  />
                </dl>
                <div className="flex items-center justify-end gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`${DEVELOPMENT_APP_PATH}/contracts/${g.id}`}>
                      Open contract
                      <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className="font-mono tabular-nums text-ink">{value}</dd>
    </div>
  );
}
