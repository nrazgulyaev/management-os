import Link from "next/link";
import {
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import {
  getOperationsKpis,
  getVillaStatusBoard,
  getMaintenanceTickets,
  getPreventiveUpcoming,
  getHousekeepingProgress,
  getServiceRequestsForCabinet,
  type VillaState,
} from "@/features/operations/operations-cabinet-queries";
import { listArrivals, listDepartures } from "@/features/front-office/services";

/**
 * Sprint TASK-6-DATA-PART-1 — Mgmt OS Operations cabinet live wiring.
 *
 * Visual port from `_handoff/management/operations.html`. This commit
 * replaces five mock arrays with live reads in
 * `src/features/operations/operations-cabinet-queries.ts`:
 *
 *   - HOUSEKEEPING     → getHousekeepingProgress() (empty until tasks seeded)
 *   - MAINTENANCE      → getMaintenanceTickets()   (live · 8 seeded tickets)
 *   - PREVENTIVE       → getPreventiveUpcoming()   (templates only — no schedule)
 *   - SERVICE_REQUESTS → getServiceRequestsForCabinet() (empty until seeded)
 *   - STATUS_TILES     → derived from getVillaStatusBoard()
 *
 * Operations Copilot AI band stays as a static empty-state copy until
 * the daily-digest agent files a run.
 */

export const metadata = { title: "Operations · Command center" };
export const dynamic = "force-dynamic";

const STATE_TILES: Array<{ key: VillaState; label: string; color: string }> = [
  { key: "ready", label: "Ready", color: "var(--ok)" },
  { key: "occupied", label: "Occupied", color: "var(--forest)" },
  { key: "cleaning", label: "Cleaning", color: "var(--terra)" },
  { key: "inspection", label: "Inspection", color: "var(--info)" },
  { key: "checkout_pending", label: "Checkout", color: "var(--warn)" },
  { key: "maintenance", label: "Maintenance", color: "var(--danger)" },
  { key: "owner_stay", label: "Owner stay", color: "var(--gold)" },
  { key: "ooo", label: "OOO", color: "var(--line-strong)" },
];

const SEVERITY_TONE: Record<string, "ok" | "info" | "gold" | "warn" | undefined> = {
  p3: undefined, // low
  p2: "info", // normal
  p1: "warn", // high
  p0: "warn", // urgent
};

const STATUS_LABEL: Record<string, { tone?: "ok" | "info" | "gold" | "warn"; text: string }> = {
  open: { text: "Open" },
  triaged: { tone: "info", text: "Triaged" },
  scheduled: { tone: "info", text: "Scheduled" },
  in_progress: { tone: "gold", text: "In progress" },
  waiting_parts: { tone: "warn", text: "Waiting parts" },
  resolved: { tone: "ok", text: "Resolved" },
};

export default async function OperationsPage() {
  const today = new Date();
  const [kpis, board, tickets, preventive, housekeeping, serviceRequests, arrivals, departures] =
    await Promise.all([
      getOperationsKpis().catch(() => null),
      getVillaStatusBoard().catch(() => []),
      getMaintenanceTickets(12).catch(() => []),
      getPreventiveUpcoming(6).catch(() => []),
      getHousekeepingProgress().catch(() => []),
      getServiceRequestsForCabinet().catch(() => []),
      listArrivals(today).catch(() => []),
      listDepartures(today).catch(() => []),
    ]);

  // Tile counts from the live board.
  const tileCounts = new Map<VillaState, number>();
  for (const v of board) {
    tileCounts.set(v.state, (tileCounts.get(v.state) ?? 0) + 1);
  }
  const totalVillas = board.length;
  const ticketsOpen = kpis?.ticketsOpen ?? tickets.length;

  // ---- hero band roll-ups ----
  const guestsTonight = arrivals.reduce((s, a) => s + (a.guestsCount || 1), 0);
  const arrivalVillas = new Set(arrivals.map((a) => a.villaCode).filter(Boolean)).size;
  const sevP3 = tickets.filter((t) => t.severity === "p3").length;
  const sevP2 = tickets.filter((t) => t.severity === "p2").length;
  const sevP1 = tickets.filter((t) => t.severity === "p1" || t.severity === "p0").length;
  const atRisk = tickets.filter((t) => t.severity === "p0" || t.severity === "p1");
  const topRisk = atRisk[0] ?? null;
  const turnoversToday = kpis?.turnoversToday ?? departures.length;
  const cleanedDone = housekeeping.filter((h) =>
    ["ready", "inspected", "done", "completed", "verified"].includes(h.status),
  ).length;
  const dateEyebrow = today.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Makassar",
  });
  const timeEyebrow = today.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  });

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <span>Operations</span> <span className="text-ink-4">·</span>{" "}
            <span className="mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
              {dateEyebrow} · {timeEyebrow} WITA
            </span>
          </div>
          <h1>Operations</h1>
        </div>
        <div className="actions">
          <Link href="/dashboard/operations/turnovers" className="btn btn-ghost btn-sm">
            ↗ Turnovers
          </Link>
          <Link href="/dashboard/operations/maintenance/new" className="btn btn-secondary btn-sm">
            + New ticket
          </Link>
          <button
            className="btn btn-accent btn-sm opacity-55 cursor-not-allowed"
            disabled
            title="Coming soon"
          >
            Brief team →
          </button>
        </div>
      </div>

      {/* Zone 1 — Today hero strip (3 tiles) */}
      <div className="ops-hero mt-[18px] mb-[18px]">
        {/* Dark arrivals tile — the urgent action */}
        <div className="ops-tile dark">
          <div className="ot-label">
            <span className="pulse-dot" style={{ background: "var(--ok)" }} /> Today ·{" "}
            {arrivals.length} {arrivals.length === 1 ? "arrival" : "arrivals"}
          </div>
          <h3 className="font-display text-[20px] leading-snug mt-0.5 mb-1.5">
            {arrivals.length === 0
              ? "No arrivals tonight."
              : `Tonight, ${guestsTonight} ${guestsTonight === 1 ? "guest" : "guests"} across ${arrivalVillas} ${arrivalVillas === 1 ? "villa" : "villas"}.`}
          </h3>
          <ul className="flex flex-col gap-1.5 text-[12.5px]">
            {arrivals.slice(0, 3).map((a) => (
              <li
                key={a.bookingId}
                className="flex items-center gap-3 rounded-md bg-white/[0.06] px-2.5 py-1.5"
              >
                <span className="flex-1 truncate">
                  {a.guestDisplay} · {a.guestsCount} pax
                </span>
                <span className="font-mono text-[11px] opacity-80">{a.villaCode ?? "—"}</span>
              </li>
            ))}
            {departures.slice(0, 1).map((d) => (
              <li
                key={d.bookingId}
                className="flex items-center gap-3 rounded-md bg-white/[0.06] px-2.5 py-1.5"
              >
                <span className="flex-1 truncate">{d.guestDisplay} · departure</span>
                <span className="font-mono text-[11px] opacity-80">{d.villaCode ?? "—"}</span>
              </li>
            ))}
            {arrivals.length === 0 && departures.length === 0 && (
              <li className="opacity-60 px-2.5 py-1.5">A quiet day on the desk.</li>
            )}
          </ul>
          <div className="ot-footer">Morning brief — coming soon.</div>
        </div>

        {/* SLA tile */}
        <div className={`ops-tile ${atRisk.length > 0 ? "tone-warn" : "tone-ok"}`}>
          <div className="ot-label">SLA · Open tickets</div>
          <h3 className="ot-value">
            {sevP3} / {sevP2} / {sevP1}
          </h3>
          <div className="ot-context">
            P3 open · P2 watch · P1 breached.
            {topRisk
              ? ` At risk: ${topRisk.title}${topRisk.villaCode ? ` @ ${topRisk.villaCode}` : ""}.`
              : " Nothing breaching."}
          </div>
          <div className="ot-footer flex items-center">
            <span>{ticketsOpen} open</span>
            <span
              className="ml-auto"
              style={atRisk.length > 0 ? { color: "var(--warn)" } : undefined}
            >
              {atRisk.length > 0 ? `⚠ ${atRisk.length} at risk` : "on track"}
            </span>
          </div>
        </div>

        {/* Turnovers tile */}
        <div className={`ops-tile ${turnoversToday > 0 ? "tone-accent" : ""}`}>
          <div className="ot-label">Turnovers today</div>
          <h3 className="ot-value">{turnoversToday > 0 ? turnoversToday : "—"}</h3>
          <div className="ot-context">
            {departures.length > 0
              ? departures
                  .map((d) => d.villaCode)
                  .filter(Boolean)
                  .slice(0, 4)
                  .join(" · ")
              : "No same-day turnovers."}
          </div>
          <div className="ot-footer flex items-center">
            <span>
              {cleanedDone}/{turnoversToday || 0} cleaned
            </span>
            <span className="ml-auto" style={{ color: "var(--ok)" }}>
              on track
            </span>
          </div>
        </div>
      </div>

      {/* AI Operations Copilot — empty state until daily-digest agent runs.
          NOTE: bg-forest is the Layer A `--forest` alias; we want the dark
          forest tone explicitly (matching original `var(--forest)`), not
          the Card primitive's `tone="dark"` which uses `--forest-deep`. */}
      <Card className="p-5 mb-[18px] bg-forest text-cream-warm relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.13] bg-[radial-gradient(60%_60%_at_100%_0%,var(--gold)_0%,transparent_60%)]"
        />
        <div className="flex gap-4 items-start relative">
          <span className="flex-shrink-0 w-11 h-11 rounded-full bg-white/[0.08] flex items-center justify-center text-[var(--gold-soft)]">
            ✦
          </span>
          <div className="flex-1">
            <div className="label text-[rgba(244,239,230,0.65)]">
              Operations Copilot
            </div>
            <p className="mt-1.5 mb-3.5 font-display text-[22px] leading-[1.3] font-light">
              The Operations Copilot will surface ad-hoc scheduling suggestions
              here the first time the{" "}
              <em className="text-[var(--gold-soft)]">daily-digest agent</em>{" "}
              files a run.
            </p>
          </div>
        </div>
      </Card>

      {/* Housekeeping + status board */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5 mb-[18px]">
        <Card id="housekeeping" padding="none" overflowHidden>
          <div className="px-[18px] py-3.5 border-b border-line-soft flex items-center">
            <h2 className="display-md">Housekeeping · today</h2>
            <span className="mono ml-auto text-[11px] text-ink-3">
              NOT SEEDED
            </span>
          </div>
          {housekeeping.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-3 italic m-0">
              No housekeeping tasks scheduled. Seed `operation_tasks` rows or
              wire the Mgmt OS scheduler to populate this board.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Villa</th>
                  <th>Time</th>
                  <th>Assignee</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Pri.</th>
                </tr>
              </thead>
              <tbody>
                {housekeeping.map((t) => (
                  <tr key={t.taskId}>
                    <td className="mono">{t.villaCode}</td>
                    <td className="mono">{t.scheduledAt}</td>
                    <td>{t.assigneeName ?? "—"}</td>
                    <td className="num">{t.progressPct}%</td>
                    <td>
                      <HandoffBadge>{t.status}</HandoffBadge>
                    </td>
                    <td className="mono">{t.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="display-sm">
            Status board · {totalVillas} {totalVillas === 1 ? "villa" : "villas"}
          </h3>
          <div className="label mt-1">Live readiness</div>
          {totalVillas === 0 ? (
            <p className="mt-3.5 text-[13px] text-ink-3 italic">
              No villas yet.
            </p>
          ) : (
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              {STATE_TILES.map((s) => (
                <div
                  key={s.key}
                  className="px-3 py-2.5 border border-line-soft rounded-[10px] bg-cream-warm flex items-center gap-2"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="text-[13px] flex-1">{s.label}</span>
                  <span className="num text-[14px] font-medium">
                    {tileCounts.get(s.key) ?? 0}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Maintenance + preventive */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5 mb-[18px]">
        <Card id="maintenance" padding="none" overflowHidden>
          <div className="px-[18px] py-3.5 border-b border-line-soft flex items-center">
            <h2 className="display-md">Maintenance tickets</h2>
            <span className="mono ml-auto text-[11px] text-ink-3">
              {tickets.length} OPEN
            </span>
          </div>
          {tickets.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-3 italic m-0">
              No open tickets. Maintenance tickets surface here once reported.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Villa</th>
                  <th>Issue</th>
                  <th>Cat.</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const status = STATUS_LABEL[t.status] ?? { text: t.status };
                  return (
                    <tr key={t.id}>
                      <td className="mono">{t.villaCode ?? "—"}</td>
                      <td className="max-w-[280px] text-[13px]">{t.title}</td>
                      <td>
                        <HandoffBadge>{t.issueCategory}</HandoffBadge>
                      </td>
                      <td>
                        <HandoffBadge tone={SEVERITY_TONE[t.severity]}>{t.severity}</HandoffBadge>
                      </td>
                      <td>
                        <HandoffBadge tone={status.tone}>{status.text}</HandoffBadge>
                      </td>
                      <td className="mono">{t.daysOpen}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card padding="none" overflowHidden>
          <div className="px-[18px] py-3.5 border-b border-line-soft">
            <h2 className="display-md">Preventive · upcoming</h2>
            <div className="label mt-1">
              Templates · no schedule yet
            </div>
          </div>
          {preventive.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-3 italic m-0">
              No preventive maintenance templates configured.
            </p>
          ) : (
            <ul className="clean py-1">
              {preventive.map((p) => (
                <li key={p.templateKey} className="flex flex-col items-start gap-1.5 px-[18px] py-3">
                  <div className="flex items-center gap-2.5 w-full">
                    <span className="serif text-[15px] flex-1">
                      {p.templateName}
                    </span>
                    <HandoffBadge>{p.defaultFrequency}</HandoffBadge>
                  </div>
                  <div className="mono text-[10.5px] text-ink-4">
                    {p.category}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Service requests */}
      <h2
        id="service-requests"
        className="display text-[30px] mt-8 mb-3.5 font-normal"
      >
        Service requests · <em>guest-side</em>
      </h2>
      <Card padding="none" overflowHidden>
        {serviceRequests.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No service requests yet. Guest-initiated requests surface here once
            the in-stay portal or concierge cabinet routes them through.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Villa</th>
                <th>Guest</th>
                <th>Request</th>
                <th>Vendor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {serviceRequests.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[11px] text-ink-3">{r.code}</td>
                  <td className="mono">{r.villaCode ?? "—"}</td>
                  <td>{r.guestName ?? "—"}</td>
                  <td className="text-[13px] max-w-[240px]">{r.requestType}</td>
                  <td className="text-ink-3">{r.vendorName ?? "—"}</td>
                  <td>
                    <HandoffBadge>{r.status}</HandoffBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
