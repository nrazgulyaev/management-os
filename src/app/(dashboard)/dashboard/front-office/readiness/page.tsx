import Link from "next/link";
import { Card, HandoffBadge, Kpi } from "@/components/dashboard/primitives";
import { NoItemsYet } from "@/components/ui/primitives";
import { CheckInButton } from "@/components/front-office/check-in-out-buttons";
import {
  listArrivalReadiness,
  summarizeReadiness,
  type VillaReadinessTone,
} from "@/features/front-office/readiness-services";

export const metadata = { title: "Arrival readiness · Front office" };
export const dynamic = "force-dynamic";

type FoTone = "ok" | "warn" | "danger" | "gold" | "info" | "ink" | "soft";

const READINESS_TONES: Record<VillaReadinessTone, FoTone> = {
  ready: "ok",
  cleaning: "warn",
  inspection: "info",
  dirty: "warn",
  occupied: "info",
  out_of_order: "danger",
  maintenance_block: "danger",
  unknown: "soft",
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
  // Guard against a malformed ?date= query param: new Date("garbage") yields an
  // Invalid Date whose .toISOString() throws RangeError and crashes the render.
  const parsedDate = sp.date ? new Date(sp.date) : new Date();
  const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/front-office">Front office</Link> / <span>Arrival readiness</span>
          </div>
          <h1>Arrival readiness — {dateStr}</h1>
        </div>
        <div className="actions">
          <Link href="/dashboard/front-office" className="btn btn-secondary btn-sm">
            Front office
          </Link>
        </div>
      </div>

      <p className="mt-3 mb-7 text-[15px] text-ink-3 max-w-[680px]">
        Pre-arrival prep status across every villa due to receive a guest today.
        Sorted by blocker urgency so the front desk can clear the worst first.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi
          label="Arrivals today"
          value={String(summary.arrivalsCount)}
        />
        <Kpi
          label="Villas ready"
          value={String(summary.villasReady)}
          sub="Clean + inspected + no blocker"
          tone={summary.villasReady > 0 ? "success" : undefined}
        />
        <Kpi
          label="In progress"
          value={String(summary.villasInProgress)}
          sub="Cleaning or inspection, no hard blocker"
          tone={summary.villasInProgress > 0 ? "gold" : undefined}
        />
        <Kpi
          label="Blocked"
          value={String(summary.villasBlocked)}
          sub="OOO, maintenance block, or open ticket"
          tone={summary.villasBlocked > 0 ? "danger" : "success"}
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
            <section>
              <div className="section-heading">
                <div className="eyebrow label">Action required</div>
                <h2>Blocked ({blockedRows.length})</h2>
              </div>
              <ReadinessTable rows={blockedRows} />
            </section>
          )}
          {cleaningRows.length > 0 && (
            <section>
              <div className="section-heading">
                <div className="eyebrow label">In progress</div>
                <h2>Cleaning, inspection, or pending tasks ({cleaningRows.length})</h2>
              </div>
              <ReadinessTable rows={cleaningRows} />
            </section>
          )}
          {readyRows.length > 0 && (
            <section>
              <div className="section-heading">
                <div className="eyebrow label">Ready</div>
                <h2>Cleared for check-in ({readyRows.length})</h2>
              </div>
              <ReadinessTable rows={readyRows} />
            </section>
          )}
        </div>
      )}

      <p className="mt-8 text-xs text-ink-4">
        Readiness states are written by housekeeping + maintenance flows
        (operations actions). To change a villa&apos;s readiness, complete the
        relevant task instead of editing it here.
      </p>
    </>
  );
}

function ReadinessTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof listArrivalReadiness>>;
}) {
  return (
    <Card padding="none" overflowHidden>
      <table className="data">
        <thead>
          <tr>
            <th>Booking</th>
            <th>Villa</th>
            <th>Guest</th>
            <th className="num">Pax</th>
            <th>Readiness</th>
            <th>Blockers</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bookingId}>
              <td className="row-title">
                <Link
                  href={`/dashboard/front-office/arrivals?focus=${encodeURIComponent(r.bookingId)}`}
                  className="hover:underline"
                >
                  {r.bookingCode}
                </Link>
              </td>
              <td className="text-ink-2">
                {r.villaCode ?? "—"}
                {r.projectName && (
                  <span className="text-ink-3"> · {r.projectName}</span>
                )}
              </td>
              <td className="text-ink-2">
                {r.guestDisplay}
              </td>
              <td className="num text-ink-3">
                {r.guestsCount}
              </td>
              <td>
                <HandoffBadge tone={READINESS_TONES[r.readinessStatus]}>
                  {readinessLabel(r.readinessStatus)}
                </HandoffBadge>
              </td>
              <td className="text-xs text-ink-2">
                {r.blockerSummary ?? (
                  <span className="text-ink-3">—</span>
                )}
              </td>
              <td>
                <CheckInButton
                  bookingId={r.bookingId}
                  bookingStatus={r.bookingStatus}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
