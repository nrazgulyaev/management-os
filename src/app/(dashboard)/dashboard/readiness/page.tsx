import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { listCurrentReadiness } from "@/features/readiness/services";
import { listVillas } from "@/features/villas/services";
import { listArrivals } from "@/features/front-office/services";
import { ReadinessSetForm } from "@/components/readiness/readiness-set-form";

export const metadata = { title: "Readiness" };
export const dynamic = "force-dynamic";

const TONES: Record<string, "ok" | "info" | "warn" | "danger" | "ink"> = {
  ready: "ok",
  occupied: "info",
  cleaning: "warn",
  inspection: "info",
  dirty: "warn",
  out_of_order: "danger",
  maintenance_block: "danger",
  unknown: "ink",
};

const READY_STATUSES = new Set(["ready", "occupied", "cleaning", "inspection"]);
const CLEANING_STATUSES = new Set(["cleaning", "dirty"]);
const BLOCKED_STATUSES = new Set(["out_of_order", "maintenance_block"]);

function fmtSince(iso: string): string {
  return new Date(iso)
    .toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");
}

export default async function ReadinessPage() {
  const [current, villaList, arrivals] = await Promise.all([
    listCurrentReadiness(),
    listVillas(),
    listArrivals(new Date()),
  ]);
  const knownVillas = new Set(current.map((c) => c.villaId));
  const villasWithoutState = villaList.filter((v) => !knownVillas.has(v.id));

  // V9D — surface arrivals whose villa is not in a "ready" / "occupied" /
  // "cleaning" / "inspection" state.
  const arrivalsNotReady = arrivals.filter(
    (a) => !READY_STATUSES.has(a.readinessStatus),
  );

  // KPIs over the current readiness set.
  const tracked = current.length;
  const readyCount = current.filter((c) => c.readinessStatus === "ready").length;
  const cleaningCount = current.filter((c) =>
    CLEANING_STATUSES.has(c.readinessStatus),
  ).length;
  const blockedCount = current.filter((c) =>
    BLOCKED_STATUSES.has(c.readinessStatus),
  ).length;

  return (
    <>
      <SectionHeading
        eyebrow="Front office · append-only timeline"
        title={
          <>
            Is the villa <em>ready</em>?
          </>
        }
        subtitle="The current state per villa. Setting a new state closes the previous one — full history lives on the villa detail page."
      />

      {arrivalsNotReady.length > 0 && (
        <Card padding="default" className="rd-alert mb-[18px]">
          <div className="av-card-h">
            <h3>
              ⚠ {arrivalsNotReady.length} arrival
              {arrivalsNotReady.length === 1 ? "" : "s"} today — villa not ready
            </h3>
          </div>
          <p className="text-[13px] text-ink-3 m-0 mb-3">
            Confirm cleaning + inspection before guest arrival. The risk scanner
            queues a notification per arrival.
          </p>
          <table className="data">
            <tbody>
              {arrivalsNotReady.map((a) => (
                <tr key={a.bookingId}>
                  <td className="mono text-[11px] text-ink-3">{a.bookingCode}</td>
                  <td className="row-title">{a.villaCode ?? "—"}</td>
                  <td>
                    <HandoffBadge tone={TONES[a.readinessStatus] ?? "warn"}>
                      {a.readinessStatus}
                    </HandoffBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi label="Villas tracked" value={String(tracked)} sub="current state" />
        <Kpi
          label="Ready"
          value={String(readyCount)}
          sub="bookable"
          tone={readyCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Cleaning"
          value={String(cleaningCount)}
          sub="turnover today"
          tone={cleaningCount > 0 ? "warn" : undefined}
        />
        <Kpi
          label="OOO / maint"
          value={String(blockedCount)}
          sub="blocked"
          tone={blockedCount > 0 ? "danger" : undefined}
        />
      </div>

      <Card padding="default" className="mb-[18px]">
        <div className="av-card-h">
          <h3>Current state · {tracked} villas</h3>
          <span className="meta">APPEND-ONLY</span>
        </div>
        {current.length === 0 ? (
          <p className="text-[13px] text-ink-3 italic m-0 py-4">
            No readiness rows yet. Use the form below to set the first state.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Villa</th>
                <th scope="col">Project</th>
                <th scope="col">Status</th>
                <th scope="col">Since</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {current.map((c) => (
                <tr key={c.villaId}>
                  <td className="row-title">{c.villaCode ?? "—"}</td>
                  <td className="text-[13px] text-ink-3">{c.projectName ?? "—"}</td>
                  <td>
                    <HandoffBadge tone={TONES[c.readinessStatus] ?? "ink"}>
                      {c.readinessStatus}
                    </HandoffBadge>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {fmtSince(c.effectiveFrom)}
                  </td>
                  <td className="text-[12px] text-ink-3">{c.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="display text-[22px] font-normal mt-8 mb-1.5" id="set">
        Set readiness
      </h2>
      <p className="text-[13px] text-ink-3 mb-3.5 max-w-[680px]">
        {villasWithoutState.length > 0
          ? `${villasWithoutState.length} villa(s) have no readiness state yet — start with one of those.`
          : "Update an existing villa's readiness state."}
      </p>
      <Card padding="default">
        <ReadinessSetForm
          villas={villaList.map((v) => ({
            id: v.id,
            label: `${v.unitCode} · ${v.projectName}`,
          }))}
        />
      </Card>
    </>
  );
}
