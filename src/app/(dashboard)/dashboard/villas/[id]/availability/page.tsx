import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { SectionHeading } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/client";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";
import { listVillaCalendarBlocks } from "@/features/availability/services";
import { getCurrentVillaReadiness } from "@/features/readiness/services";
import { quoteForRange } from "@/features/pricing/services";
import { quoteDynamicCalendar } from "@/features/dynamic-pricing/services";

export const metadata = { title: "Villa availability" };
export const dynamic = "force-dynamic";

const TYPE_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  guest_booking: "info",
  owner_stay: "info",
  maintenance_block: "warning",
  deep_cleaning: "warning",
  inspection: "info",
  out_of_order: "danger",
  internal_hold: "neutral",
  channel_hold: "neutral",
};

const READINESS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  ready: "success",
  occupied: "info",
  cleaning: "warning",
  inspection: "info",
  dirty: "warning",
  out_of_order: "danger",
  maintenance_block: "danger",
  unknown: "neutral",
};

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default async function VillaAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) notFound();

  const organizationId = await requireOrgId();

  const [villa] = await db
    .select({
      id: villas.id,
      unitCode: villas.unitCode,
      name: villas.name,
      projectName: projectsTable.name,
    })
    .from(villas)
    .innerJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .where(and(eq(villas.id, id), eq(projectsTable.organizationId, organizationId)))
    .limit(1);
  if (!villa) notFound();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const todayStr = today.toISOString().slice(0, 10);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const [blocks, readiness, quote, dynamicCal] = await Promise.all([
    listVillaCalendarBlocks({
      villaId: id,
      rangeStart: today,
      rangeEnd: horizon,
      status: "active",
      limit: 200,
    }),
    getCurrentVillaReadiness(id),
    quoteForRange({ villaId: id, checkIn: todayStr, checkOut: horizonStr }),
    quoteDynamicCalendar({
      villaId: id,
      startDate: todayStr,
      days: 30,
      channelKey: "direct",
      organizationId,
    }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow={`Portfolio · villas · ${villa.unitCode} · availability`}
        title={`${villa.unitCode} · availability`}
        subtitle="Combined calendar — bookings, owner stays, maintenance, OOO, internal holds, plus current readiness and a 30-day rate-card preview."
      />

      <section>
        <div className="label">Now</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Status
        </h2>
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">Readiness</div>
            <div className="mt-1">
              <Badge tone={READINESS_TONES[readiness?.readinessStatus ?? "unknown"] ?? "neutral"}>
                {readiness?.readinessStatus ?? "unknown"}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">Active blocks (30d)</div>
            <div className="mt-1 text-ink tabular-nums">{blocks.length}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">30-day rate-card preview</div>
            <div className="mt-1 text-ink-tertiary text-xs">
              {quote.available
                ? `${formatMoney(quote.grossAmountMinor, quote.currency)} across ${quote.nights} nights`
                : `unavailable: ${quote.reason}`}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="label">Dynamic pricing</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          {dynamicCal.ruleSet
            ? `${dynamicCal.ruleSet.name} · 30-day overlay`
            : "No applicable rule set"}
        </h2>
        {dynamicCal.cells.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No dynamic-pricing rule set applies to this villa yet.
          </p>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {dynamicCal.cells.map((c) => (
              <div
                key={c.date}
                className="rounded-md border border-line-soft bg-surface p-3 text-xs"
                title={`${c.date} · ${c.reason}`}
              >
                <div className="font-mono text-[10px] text-ink-tertiary">{c.date}</div>
                <div className="mt-1 text-ink">
                  {c.available ? (
                    <span className="font-mono">
                      {(c.finalRateMinor / 100n).toString()}.
                      {String(c.finalRateMinor % 100n).padStart(2, "0")} {c.currency}
                    </span>
                  ) : (
                    <Badge tone={c.reason === "stop_sell" ? "danger" : "warning"}>
                      {c.reason}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="label">Next 30 days</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          {blocks.length} active blocks
        </h2>
        {blocks.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            Open for booking across the next 30 days.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Title</th>
                  <th className="text-left px-3 py-2">From</th>
                  <th className="text-left px-3 py-2">To</th>
                  <th className="text-left px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {blocks.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2">
                      <Badge tone={TYPE_TONES[b.blockType] ?? "neutral"}>
                        {b.blockType.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{b.title}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {b.startsAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {b.endsAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {b.sourceType ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {quote.available && quote.breakdown.length > 0 && (
        <section>
          <div className="label">Rate card</div>
          <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
            Next 30 nights
          </h2>
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-right px-3 py-2">Rate</th>
                  <th className="text-left px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {quote.breakdown.map((n) => (
                  <tr key={n.date}>
                    <td className="px-3 py-2 text-ink-secondary tabular-nums">{n.date}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(n.nightlyRateMinor, quote.currency)}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">{n.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
