import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  listArrivals,
  listDepartures,
  listInHouseGuests,
  listCheckinCheckoutRequests,
  type ArrivalRow,
  type DepartureRow,
  type InHouseRow,
} from "@/features/front-office/services";
import { loadFrontOfficeCopilotOutputs } from "@/lib/development/server/ai/front-office-copilot-queries";
import { isAgentEnabledForCurrentOrg } from "@/features/ai-agents/is-agent-enabled-for-org";

/**
 * Phase 2.4 mgmt-03 — Front-office "today board" wiring.
 *
 * Ports the cabinet prototype's recommended Variant A (3-column board:
 * Arrivals · In-house · Departures) onto live data, replacing the prior
 * award-component stack (HeroGreetingAI / RoomStatusBoard / gauges). The
 * board primitives (`.today-board`, `.fo-card`) already shipped in
 * `styles/components/front-office.css`; this page adopts them. The villa ×
 * day matrix moves out — per the prototype it belongs in Housekeeping.
 */

export const metadata = { title: "Front office" };
export const dynamic = "force-dynamic";

const TZ = "Asia/Makassar"; // WITA — front desk local time

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isoDaysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T00:00:00Z").getTime();
  const b = new Date(bIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}
function hm(ts: string | null): string {
  if (!ts) return "—";
  const t = new Date(ts);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}
function dayOf(checkIn: string, checkOut: string, todayIso: string): string {
  const total = Math.max(1, isoDaysBetween(checkIn, checkOut));
  const elapsed = Math.min(total, Math.max(1, isoDaysBetween(checkIn, todayIso) + 1));
  return `day ${elapsed}/${total}`;
}
function readinessFor(
  readiness: string,
): "ready" | "in_progress" | "blocked" | "unknown" {
  switch (readiness) {
    case "ready":
      return "ready";
    case "in_progress":
    case "preparing":
      return "in_progress";
    case "blocked":
    case "blocker":
      return "blocked";
    default:
      return "unknown";
  }
}

type Flavour = "ready" | "flag" | "problem" | "";

function FoCard({
  href,
  villa,
  window: windowLabel,
  name,
  meta,
  flavour,
  badge,
  next,
}: {
  href?: string;
  villa: string;
  window: string;
  name: string;
  meta: string;
  flavour: Flavour;
  badge?: string;
  next?: string;
}) {
  const cls = `fo-card${flavour ? ` fo-${flavour}` : ""}`;
  const inner = (
    <>
      <header className="fo-head">
        <span className="fo-villa mono">{villa}</span>
        <span className="fo-window mono">{windowLabel}</span>
      </header>
      <div className="fo-main">
        <div className="fo-name">{name}</div>
        <div className="fo-meta mono">{meta}</div>
      </div>
      {(badge || next) && (
        <footer className="fo-foot">
          {badge && <span className="fo-badge mono">{badge}</span>}
          {next && <span className="fo-next">{next}</span>}
        </footer>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function arrivalCard(a: ArrivalRow) {
  const r = readinessFor(a.readinessStatus);
  const flavour: Flavour =
    r === "blocked"
      ? "problem"
      : r === "ready"
        ? "ready"
        : r === "in_progress" || a.hasOpenServiceRequest
          ? "flag"
          : "";
  const badge =
    r === "ready"
      ? "READY"
      : r === "blocked"
        ? "BLOCKED"
        : r === "in_progress"
          ? "PREP"
          : undefined;
  return (
    <FoCard
      key={a.bookingId}
      href={`/dashboard/bookings/${a.bookingId}`}
      villa={a.villaCode ?? "—"}
      window={(a.channelName ?? "Direct").toUpperCase()}
      name={a.guestDisplay}
      meta={`${a.guestsCount} guest${a.guestsCount === 1 ? "" : "s"}${a.projectName ? ` · ${a.projectName}` : ""}`}
      flavour={flavour}
      badge={badge}
      next={a.hasOpenServiceRequest ? "Guest request ↗" : undefined}
    />
  );
}

function inHouseCard(r: InHouseRow, todayIso: string) {
  const flavour: Flavour =
    r.openMaintenanceTickets > 0 ? "problem" : r.openServiceRequests > 0 ? "flag" : "";
  const badge =
    r.openMaintenanceTickets > 0
      ? "ISSUE"
      : r.openServiceRequests > 0
        ? "REQUEST"
        : undefined;
  const next =
    r.openMaintenanceTickets > 0
      ? "Maintenance ↗"
      : r.openServiceRequests > 0
        ? "Concierge ↗"
        : undefined;
  return (
    <FoCard
      key={r.bookingId}
      href={`/dashboard/bookings/${r.bookingId}`}
      villa={r.villaCode ?? "—"}
      window={dayOf(r.checkInDate, r.checkOutDate, todayIso)}
      name={r.guestDisplay}
      meta={`${r.checkInDate} — ${r.checkOutDate}`}
      flavour={flavour}
      badge={badge}
      next={next}
    />
  );
}

function departureCard(d: DepartureRow) {
  const done = d.bookingStatus === "checked_out";
  const latePending =
    !!d.lateCheckoutRequestStatus &&
    d.lateCheckoutRequestStatus !== "none" &&
    d.lateCheckoutRequestStatus !== "denied";
  const flavour: Flavour = done ? "ready" : latePending ? "flag" : "";
  return (
    <FoCard
      key={d.bookingId}
      href={`/dashboard/bookings/${d.bookingId}`}
      villa={d.villaCode ?? "—"}
      window={done ? "done" : hm(d.expectedCheckoutAt)}
      name={d.guestDisplay}
      meta={`out ${d.checkOutDate}${d.nextArrivalBookingId ? " · same-day turn" : ""}`}
      flavour={flavour}
      badge={done ? "DONE" : latePending ? "LATE?" : undefined}
      next={d.nextArrivalBookingId ? "Turnover ↗" : undefined}
    />
  );
}

function EmptyCol({ label }: { label: string }) {
  return <p className="m-0 px-1 py-2 text-[12px] italic text-ink-3">{label}</p>;
}

export default async function FrontOfficeTodayPage() {
  const today = new Date();
  const todayIso = ymd(today);

  const [arrivals, departures, inHouse, openRequests, copilotOutputs, copilotEnabled] =
    await Promise.all([
      listArrivals(today),
      listDepartures(today),
      listInHouseGuests(today),
      listCheckinCheckoutRequests({ status: "requested", limit: 50 }),
      loadFrontOfficeCopilotOutputs({ limit: 3 }).catch(() => []),
      isAgentEnabledForCurrentOrg("front_office_copilot").catch(() => false),
    ]);

  // KPI roll-ups.
  const readyArrivals = arrivals.filter(
    (a) => readinessFor(a.readinessStatus) === "ready",
  ).length;
  const inHouseVillas = new Set(inHouse.map((r) => r.villaId)).size;
  const doneDepartures = departures.filter(
    (d) => d.bookingStatus === "checked_out",
  ).length;
  const turnovers = departures.filter((d) => d.nextArrivalBookingId).length;
  const flags =
    arrivals.filter(
      (a) => readinessFor(a.readinessStatus) === "blocked" || a.hasOpenServiceRequest,
    ).length +
    inHouse.filter((r) => r.openMaintenanceTickets > 0 || r.openServiceRequests > 0)
      .length;

  const weekday = today.toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ });
  const dateLabel = today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
  const nowLabel = today.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Front office · today</span>
          </div>
          <h1>
            {weekday} · {dateLabel}
          </h1>
        </div>
        <div className="actions">
          <span className="chip mono">
            <span className="pulse-dot" />
            live · {nowLabel} WITA
          </span>
          <button
            className="btn btn-ghost btn-sm opacity-55 cursor-not-allowed"
            disabled
            title="Coming soon"
          >
            Day report
          </button>
          <Link href="/dashboard/bookings/new" className="btn btn-primary btn-sm">
            + Walk-in
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Arriving"
          value={String(arrivals.length)}
          sub={
            arrivals.length === 0
              ? "quiet desk"
              : `${readyArrivals} ready · ${arrivals.length - readyArrivals} to go`
          }
        />
        <Kpi
          label="In-house"
          value={String(inHouse.length)}
          sub={`${inHouseVillas} villa${inHouseVillas === 1 ? "" : "s"} occupied`}
        />
        <Kpi
          label="Leaving"
          value={String(departures.length)}
          sub={
            departures.length === 0
              ? "none today"
              : `${doneDepartures} done`
          }
        />
        <Kpi
          label="Turnovers"
          value={String(turnovers)}
          sub="villas same-day"
          tone="accent"
        />
        <Kpi
          label="Flags"
          value={String(flags)}
          sub={flags > 0 ? "need attention" : "all clear"}
          tone="gold"
        />
      </div>

      {/* Variant A — 3-column today board */}
      <div className="today-board">
        <section className="tb-col tb-col-arrivals">
          <header className="tb-col-head">
            <span className="tb-col-title">Arrivals</span>
            <Link
              href="/dashboard/front-office/arrivals"
              className="tb-col-count mono hover:underline"
            >
              {arrivals.length} · all →
            </Link>
          </header>
          <div className="tb-col-body">
            {arrivals.length === 0 ? (
              <EmptyCol label="No arrivals today." />
            ) : (
              arrivals.map(arrivalCard)
            )}
          </div>
        </section>

        <section className="tb-col tb-col-in-house">
          <header className="tb-col-head">
            <span className="tb-col-title">In-house</span>
            <Link
              href="/dashboard/front-office/in-house"
              className="tb-col-count mono hover:underline"
            >
              {inHouse.length} · all →
            </Link>
          </header>
          <div className="tb-col-body">
            {inHouse.length === 0 ? (
              <EmptyCol label="No guests in-house." />
            ) : (
              inHouse.map((r) => inHouseCard(r, todayIso))
            )}
          </div>
        </section>

        <section className="tb-col tb-col-departures">
          <header className="tb-col-head">
            <span className="tb-col-title">Departures</span>
            <Link
              href="/dashboard/front-office/departures"
              className="tb-col-count mono hover:underline"
            >
              {departures.length} · all →
            </Link>
          </header>
          <div className="tb-col-body">
            {departures.length === 0 ? (
              <EmptyCol label="No departures today." />
            ) : (
              departures.map(departureCard)
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2">
          <Section
            eyebrow="Desk tools"
            title="Boards & queues"
            description="Deeper views for readiness, the request inbox, and ops."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <BoardCard
                href="/dashboard/front-office/readiness"
                title="Arrival readiness"
                detail="Per-villa prep status + open blockers"
              />
              <BoardCard
                href="/dashboard/front-office/requests"
                title="Guest requests"
                detail={
                  openRequests.length > 0
                    ? `${openRequests.length} awaiting review`
                    : "Inbox clear"
                }
              />
              <BoardCard
                href="/dashboard/front-office/watch"
                title="Watch rules"
                detail="VIP · visa · turnover alerts"
              />
              <BoardCard
                href="/dashboard/operations"
                title="Operations overview"
                detail="Cross-team daily picture"
              />
            </div>
          </Section>
        </div>

        <aside>
          <Section eyebrow="AI" title="Front-office copilot">
            {!copilotEnabled ? (
              <Link
                href="/dashboard/settings/ai-agents/front_office_copilot"
                className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 flex flex-col gap-3 hover:opacity-95 transition-opacity"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                  Coming soon · Configure key
                </span>
                <p className="text-sm leading-relaxed opacity-90">
                  The front-office-copilot agent ships dry-run by default. Wire a
                  provider key to flip it live; outputs surface here.
                </p>
                <Badge tone="outline" className="self-start">
                  Configure provider →
                </Badge>
              </Link>
            ) : copilotOutputs.length === 0 ? (
              <Link
                href="/dashboard/ai/jobs?agent=front_office_copilot"
                className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 flex flex-col gap-3 hover:opacity-95 transition-opacity"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                  No runs yet
                </span>
                <p className="text-sm leading-relaxed opacity-90">
                  Trigger the copilot to surface today&rsquo;s exception list across
                  arrivals, in-house guests, and open requests.
                </p>
                <Badge tone="outline" className="self-start">
                  Run copilot →
                </Badge>
              </Link>
            ) : (
              <div className="flex flex-col gap-3">
                {copilotOutputs.map((o) => (
                  <Link
                    key={o.id}
                    href={`/dashboard/ai/outputs/${o.outputCode}`}
                    className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-5 flex flex-col gap-2 hover:opacity-95 transition-opacity"
                  >
                    <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                      {new Date(o.createdAt).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "numeric",
                      })}
                    </span>
                    <h4 className="text-sm font-medium line-clamp-2">{o.title}</h4>
                    <p className="text-xs opacity-90 leading-relaxed line-clamp-3">
                      {o.summary}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}

function BoardCard({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card hover:shadow-elevated-card hover:border-line-strong transition-all block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
