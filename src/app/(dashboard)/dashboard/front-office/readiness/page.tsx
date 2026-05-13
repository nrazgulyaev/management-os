import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardKpi, NoItemsYet } from "@/components/ui/primitives";
import { CheckInButton } from "@/components/front-office/check-in-out-buttons";
import {
  listArrivalReadiness,
  summarizeReadiness,
  type VillaReadinessTone,
} from "@/features/front-office/readiness-services";

export const metadata = { title: "Arrival readiness · Front office" };
export const dynamic = "force-dynamic";

const READINESS_TONES: Record<
  VillaReadinessTone,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  ready: "success",
  cleaning: "warning",
  inspection: "info",
  dirty: "warning",
  occupied: "info",
  out_of_order: "danger",
  maintenance_block: "danger",
  unknown: "neutral",
};

function readinessLabel(s: VillaReadinessTone): string {
  return s.replace(/_/g, " ");
}

export default async function FrontOfficeReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date ? new Date(sp.date) : new Date();
  const dateStr = date.toISOString().slice(0, 10);

  const rows = await listArrivalReadiness(date);
  const summary = summarizeReadiness(rows);

  const blockedRows = rows.filter((r) => r.isBlocked);
  const cleaningRows = rows.filter(
    (r) => !r.isBlocked && r.readinessStatus !== "ready",
  );
  const readyRows = rows.filter(
    (r) => !r.isBlocked && r.readinessStatus === "ready",
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Front office", href: "/dashboard/front-office" },
          { label: "Arrival readiness" },
        ]}
        title={`Arrival readiness — ${dateStr}`}
        description="Pre-arrival prep status across every villa due to receive a guest today. Sorted by blocker urgency so the front desk can clear the worst first."
        actions={
          <Button asChild variant="secondary">
            <Link href="/dashboard/front-office">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Front office
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpi
          label="Arrivals today"
          value={String(summary.arrivalsCount)}
          status="neutral"
          drillHref="/dashboard/front-office/arrivals"
        />
        <DashboardKpi
          label="Villas ready"
          value={String(summary.villasReady)}
          status={summary.villasReady > 0 ? "good" : "neutral"}
          hint="Villa is clean + inspected + no blocker"
        />
        <DashboardKpi
          label="In progress"
          value={String(summary.villasInProgress)}
          status={summary.villasInProgress > 0 ? "warn" : "neutral"}
          hint="Cleaning or inspection in progress, no hard blocker"
        />
        <DashboardKpi
          label="Blocked"
          value={String(summary.villasBlocked)}
          status={summary.villasBlocked > 0 ? "bad" : "good"}
          hint="OOO, maintenance block, or open maintenance ticket"
        />
      </div>

      {rows.length === 0 ? (
        <NoItemsYet
          entityLabel="arrivals"
          description={`No bookings are scheduled to check in on ${dateStr}. Pick a different date in the URL (e.g. ?date=YYYY-MM-DD) to plan ahead.`}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {blockedRows.length > 0 && (
            <Section
              eyebrow="Action required"
              title={`Blocked (${blockedRows.length})`}
            >
              <ReadinessTable rows={blockedRows} />
            </Section>
          )}
          {cleaningRows.length > 0 && (
            <Section
              eyebrow="In progress"
              title={`Cleaning, inspection, or pending tasks (${cleaningRows.length})`}
            >
              <ReadinessTable rows={cleaningRows} />
            </Section>
          )}
          {readyRows.length > 0 && (
            <Section
              eyebrow="Ready"
              title={`Cleared for check-in (${readyRows.length})`}
            >
              <ReadinessTable rows={readyRows} />
            </Section>
          )}
        </div>
      )}

      <p className="text-xs text-ink-tertiary">
        Readiness states are written by housekeeping + maintenance flows
        (operations actions). To change a villa&apos;s readiness, complete the
        relevant task instead of editing it here.
      </p>
    </div>
  );
}

function ReadinessTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof listArrivalReadiness>>;
}) {
  return (
    <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
          <tr>
            <th className="text-left px-3 py-2">Booking</th>
            <th className="text-left px-3 py-2">Villa</th>
            <th className="text-left px-3 py-2">Guest</th>
            <th className="text-right px-3 py-2">Pax</th>
            <th className="text-left px-3 py-2">Readiness</th>
            <th className="text-left px-3 py-2">Blockers</th>
            <th className="text-left px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((r) => (
            <tr key={r.bookingId}>
              <td className="px-3 py-2 text-ink font-medium">
                <Link
                  href={`/dashboard/front-office/arrivals?focus=${encodeURIComponent(r.bookingId)}`}
                  className="hover:underline"
                >
                  {r.bookingCode}
                </Link>
              </td>
              <td className="px-3 py-2 text-ink-secondary">
                {r.villaCode ?? "—"}
                {r.projectName && (
                  <span className="text-ink-tertiary"> · {r.projectName}</span>
                )}
              </td>
              <td className="px-3 py-2 text-ink-secondary">
                {r.guestDisplay}
              </td>
              <td className="px-3 py-2 text-right text-ink-tertiary tabular-nums">
                {r.guestsCount}
              </td>
              <td className="px-3 py-2">
                <Badge tone={READINESS_TONES[r.readinessStatus]}>
                  {readinessLabel(r.readinessStatus)}
                </Badge>
              </td>
              <td className="px-3 py-2 text-xs text-ink-secondary">
                {r.blockerSummary ?? (
                  <span className="text-ink-tertiary">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <CheckInButton
                  bookingId={r.bookingId}
                  bookingStatus={r.bookingStatus}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
