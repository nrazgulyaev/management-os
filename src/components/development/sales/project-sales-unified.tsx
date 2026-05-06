import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatUSD } from "@/lib/utils";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import { CONTRACT_GROUP_STATUS_LABEL } from "@/lib/development/constants/contracts-constants";
import {
  MILESTONE_STATUS_LABEL,
  RESERVATION_STATUS_LABEL,
} from "@/lib/development/constants/payment-constants";
import type { ContractGroupListItem } from "@/lib/development/types/contracts";
import type { ReservationListItem } from "@/lib/development/types/reservations";
import type { ContractMilestoneRow, InvoiceListItem } from "@/lib/development/types/payments";

export interface ProjectSalesMetrics {
  activeLeads: number;
  activeReservations: number;
  signedContractGroups: number;
  totalContractedUsdMinor: bigint;
  upcomingMilestones30d: { count: number; totalUsdMinor: bigint };
  overdueInvoices: { count: number; totalUsdMinor: bigint };
}

export interface ProjectSalesData {
  projectId: string;
  metrics: ProjectSalesMetrics;
  reservations: ReservationListItem[];
  contractGroups: ContractGroupListItem[];
  upcomingMilestones: Array<
    ContractMilestoneRow & {
      contactFullName: string;
      villaCode: string;
    }
  >;
  recentInvoices: InvoiceListItem[];
}

function fmtUsdMinor(minor: bigint): string {
  return formatUSD(Number(minor) / 100);
}

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

const milestoneTone: Record<
  string,
  "neutral" | "accent" | "gold" | "warning" | "danger" | "success"
> = {
  pending: "neutral",
  pre_invoiced: "gold",
  invoiced: "gold",
  partially_paid: "warning",
  paid: "success",
  overdue: "danger",
  waived: "neutral",
  cancelled: "neutral",
};

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

const invoiceTone: Record<
  string,
  "neutral" | "accent" | "gold" | "warning" | "danger" | "success"
> = {
  draft: "neutral",
  sent: "accent",
  viewed: "accent",
  paid: "success",
  overdue: "danger",
  void: "neutral",
};

/** Unified Sales view rendered inside the project Sales tab. */
export function ProjectSalesUnified({
  data,
  leadsView,
}: {
  data: ProjectSalesData;
  /** Pre-rendered Leads pipeline (from Stage 2.2.A). */
  leadsView: React.ReactNode;
}) {
  const { metrics, reservations, contractGroups, upcomingMilestones, recentInvoices } = data;

  return (
    <div className="flex flex-col gap-8">
      {/* Top metric strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Metric label="Active leads" value={String(metrics.activeLeads)} />
        <Metric
          label="Active reservations"
          value={String(metrics.activeReservations)}
        />
        <Metric
          label="Signed contracts"
          value={String(metrics.signedContractGroups)}
        />
        <Metric
          label="Contracted value"
          value={fmtUsdMinor(metrics.totalContractedUsdMinor)}
        />
        <Metric
          label="Due ≤ 30 days"
          value={String(metrics.upcomingMilestones30d.count)}
          hint={fmtUsdMinor(metrics.upcomingMilestones30d.totalUsdMinor)}
        />
        <Metric
          label="Overdue invoices"
          value={String(metrics.overdueInvoices.count)}
          hint={fmtUsdMinor(metrics.overdueInvoices.totalUsdMinor)}
          warn={metrics.overdueInvoices.count > 0}
        />
      </div>

      {/* Leads pipeline (from 2.2.A) */}
      <Section
        eyebrow="Leads"
        title="Pipeline"
        action={
          <Link
            href={`${DEVELOPMENT_APP_PATH}/sales`}
            className="text-xs text-ink-tertiary hover:text-ink inline-flex items-center gap-1"
          >
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        }
      >
        {leadsView}
      </Section>

      {/* Reservations */}
      <Section
        eyebrow="Reservations"
        title={`Active reservations · ${reservations.length}`}
        action={
          <Link
            href={`${DEVELOPMENT_APP_PATH}/reservations`}
            className="text-xs text-ink-tertiary hover:text-ink inline-flex items-center gap-1"
          >
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        }
      >
        {reservations.length === 0 ? (
          <EmptyState
            title="No reservations yet"
            description="When a lead reserves a unit, the entry shows here with payment status and expiry."
          />
        ) : (
          <CompactTable>
            <thead>
              <tr>
                <Th>Buyer</Th>
                <Th>Unit</Th>
                <Th>Date</Th>
                <Th>Fee paid</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
                >
                  <Td>{r.contactFullName}</Td>
                  <Td>{r.villaCode}</Td>
                  <Td className="font-mono text-xs text-ink-tertiary">
                    {formatDate(r.createdAt, "short")}
                  </Td>
                  <Td>{r.paidAt ? "✓" : "—"}</Td>
                  <Td className="font-mono text-xs text-ink-tertiary">
                    {r.expiresAt ? formatDate(r.expiresAt, "short") : "—"}
                  </Td>
                  <Td>
                    <Badge tone={reservationTone[r.status] ?? "neutral"}>
                      {RESERVATION_STATUS_LABEL[r.status as keyof typeof RESERVATION_STATUS_LABEL] ?? r.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </CompactTable>
        )}
      </Section>

      {/* Contract groups */}
      <Section
        eyebrow="Contracts"
        title={`Contract groups · ${contractGroups.length}`}
        action={
          <Link
            href={`${DEVELOPMENT_APP_PATH}/contracts`}
            className="text-xs text-ink-tertiary hover:text-ink inline-flex items-center gap-1"
          >
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        }
      >
        {contractGroups.length === 0 ? (
          <EmptyState
            title="No contract groups yet"
            description="Convert a paid reservation into a contract to populate this section."
          />
        ) : (
          <CompactTable>
            <thead>
              <tr>
                <Th>Buyer</Th>
                <Th>Unit</Th>
                <Th>Date</Th>
                <Th className="text-right">Value (USD)</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {contractGroups.map((g) => (
                <tr
                  key={g.id}
                  className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
                >
                  <Td>{g.contactFullName}</Td>
                  <Td>{g.villaCode}</Td>
                  <Td className="font-mono text-xs text-ink-tertiary">
                    {formatDate(g.contractDate, "short")}
                  </Td>
                  <Td className="text-right font-mono">
                    {fmtUsdMinor(g.totalContractValueUsdMinor)}
                  </Td>
                  <Td>
                    <Badge tone={groupTone[g.status] ?? "neutral"}>
                      {CONTRACT_GROUP_STATUS_LABEL[g.status] ?? g.status}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`${DEVELOPMENT_APP_PATH}/contracts/${g.id}`}
                      className="text-xs text-accent hover:underline"
                    >
                      Open
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </CompactTable>
        )}
      </Section>

      {/* Upcoming milestones */}
      <Section
        eyebrow="Milestones"
        title={`Upcoming · next 30 days · ${upcomingMilestones.length}`}
      >
        {upcomingMilestones.length === 0 ? (
          <EmptyState
            title="No milestones due soon"
            description="Milestones with `expected_due_date` within 30 days appear here."
          />
        ) : (
          <CompactTable>
            <thead>
              <tr>
                <Th>Buyer</Th>
                <Th>Unit</Th>
                <Th>Milestone</Th>
                <Th>Due</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {upcomingMilestones.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
                >
                  <Td>{m.contactFullName}</Td>
                  <Td>{m.villaCode}</Td>
                  <Td>{m.name}</Td>
                  <Td className="font-mono text-xs text-ink-tertiary">
                    {m.expectedDueDate ? formatDate(m.expectedDueDate, "short") : "—"}
                  </Td>
                  <Td className="text-right font-mono">
                    {fmtUsdMinor(m.expectedAmountUsdMinor)}
                  </Td>
                  <Td>
                    <Badge tone={milestoneTone[m.status] ?? "neutral"}>
                      {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </CompactTable>
        )}
      </Section>

      {/* Recent invoices */}
      <Section
        eyebrow="Invoices"
        title={`Recent · ${recentInvoices.length}`}
        action={
          <Link
            href={`${DEVELOPMENT_APP_PATH}/invoices`}
            className="text-xs text-ink-tertiary hover:text-ink inline-flex items-center gap-1"
          >
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        }
      >
        {recentInvoices.length === 0 ? (
          <EmptyState
            title="No invoices issued yet"
            description="Issue an invoice from the milestone to populate this section."
          />
        ) : (
          <CompactTable>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Buyer</Th>
                <Th>Issued</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {recentInvoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
                >
                  <Td className="font-mono text-xs text-ink">
                    {inv.invoiceNumber}
                  </Td>
                  <Td>{inv.contactFullName}</Td>
                  <Td className="font-mono text-xs text-ink-tertiary">
                    {formatDate(inv.issuedAt, "short")}
                  </Td>
                  <Td className="text-right font-mono">
                    {fmtUsdMinor(inv.amountUsdMinor)}
                  </Td>
                  <Td>
                    <Badge tone={invoiceTone[inv.status] ?? "neutral"}>
                      {inv.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </CompactTable>
        )}
      </Section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={
        warn
          ? "rounded-md border border-danger/30 bg-danger-weak/40 p-4 flex flex-col gap-1"
          : "rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-1"
      }
    >
      <span className="text-label">{label}</span>
      <span className="text-display text-[22px] leading-none font-medium text-ink">
        {value}
      </span>
      {hint && <span className="text-[11px] text-ink-tertiary">{hint}</span>}
    </div>
  );
}

function CompactTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={
        "px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-left " +
        (className ?? "")
      }
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={"px-4 py-3 text-ink " + (className ?? "")}>{children}</td>
  );
}
