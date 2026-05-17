import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardCheck,
  Inbox,
  Sparkles,
} from "lucide-react";
import {} from "@/components/ui/primitives";
import {
  GuestArrivalsList,
  HalfDonutGauge,
  HeroGreetingAI,
  KpiRowMixed,
  RoomStatusBoard,
  type GuestArrivalItem,
  type KpiItem,
} from "@/components/award";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  listArrivals,
  listDepartures,
  listInHouseGuests,
  listCheckinCheckoutRequests,
} from "@/features/front-office/services";
import { loadFrontOfficeRoomBoard } from "@/features/front-office/room-board";
import { loadFrontOfficeCopilotOutputs } from "@/lib/development/server/ai/front-office-copilot-queries";
import { isAgentEnabledForCurrentOrg } from "@/features/ai-agents/is-agent-enabled-for-org";

/**
 * Mega-Sprint / Phase 8 — Front Office (Mgmt OS) cabinet on Sprint-4
 * gold standard. Replaces the Stage-10.5.A.3.3 CabinetGreetingBlock +
 * PageHeaderHero stack with <HeroGreetingAI> (note: Mgmt OS has no
 * front-office-dedicated AI agent yet — placeholder copy ships with
 * a TODO toward the future `front-office-copilot`). Surfaces the new
 * <RoomStatusBoard> (villa × day matrix) and <GuestArrivalsList>
 * (timed arrivals list with readiness pills) — both reused on
 * Phase-10 Concierge.
 */

export const metadata = { title: "Front office" };
export const dynamic = "force-dynamic";

function todayLabel(now: Date): string {
  const day = now.getDate();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${day} · ${weekday}, ${month}`;
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

export default async function FrontOfficeTodayPage() {
  const today = new Date();
  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const [
    arrivals,
    departures,
    inHouse,
    openRequests,
    board,
    copilotOutputs,
    copilotEnabled,
  ] = await Promise.all([
    listArrivals(today),
    listDepartures(today),
    listInHouseGuests(today),
    listCheckinCheckoutRequests({ status: "requested", limit: 50 }),
    loadFrontOfficeRoomBoard(today, 7),
    loadFrontOfficeCopilotOutputs({ limit: 3 }).catch(() => []),
    isAgentEnabledForCurrentOrg("front_office_copilot").catch(() => false),
  ]);

  const occupiedToday = inHouse.length + arrivals.length;
  const totalVillas = board.rows.length;
  const occupancyPct =
    totalVillas > 0
      ? Math.round((occupiedToday / totalVillas) * 100)
      : 0;

  const kpis: KpiItem[] = [
    {
      label: "Tonight's occupancy",
      value: totalVillas > 0 ? `${occupancyPct}%` : "—",
      delta:
        totalVillas > 0
          ? `${occupiedToday} of ${totalVillas} villas`
          : "No villa records yet",
      href: "/dashboard/villas",
    },
    {
      label: "Arrivals today",
      value: String(arrivals.length),
      delta:
        arrivals.length === 0
          ? "Quiet check-in desk"
          : "Expected check-ins",
      href: "/dashboard/front-office/arrivals",
    },
    {
      label: "Departures today",
      value: String(departures.length),
      delta:
        departures.length === 0
          ? "Nothing on the way out"
          : "Expected check-outs",
      href: "/dashboard/front-office/departures",
    },
    {
      label: "Pending requests",
      value: String(openRequests.length),
      delta:
        openRequests.length === 0
          ? "Inbox clear"
          : "Awaiting review",
      href: "/dashboard/front-office/requests",
    },
  ];

  const arrivalItems: GuestArrivalItem[] = arrivals.map((a) => ({
    id: a.bookingId,
    guestDisplay: a.guestDisplay,
    guestsCount: a.guestsCount,
    villaCode: a.villaCode ?? "—",
    villaSubtitle: a.projectName ?? undefined,
    channelName: a.channelName,
    timestamp: a.checkInDate,
    readiness: readinessFor(a.readinessStatus),
    hasOpenServiceRequest: a.hasOpenServiceRequest,
    href: `/dashboard/bookings/${a.bookingId}`,
  }));

  const boardRows = board.rows.map((r) => ({
    villaId: r.villaId,
    villaCode: r.villaCode,
    subtitle: r.projectName ?? undefined,
    days: r.days,
    href: `/dashboard/villas/${r.villaId}`,
  }));

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <HeroGreetingAI
        firstName={firstName}
        role="Front Office · Cabinet"
        dateLabel={todayLabel(today)}
        aiPromptPlaceholder="Front-office copilot — coming soon."
        showMyTasksHref="/dashboard/front-office/requests"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {[
          {
            href: "/dashboard/front-office/requests",
            icon: Inbox,
            label: "Triage guest requests",
            caption:
              openRequests.length > 0
                ? `${openRequests.length} waiting`
                : "Inbox clear",
          },
          {
            href: "/dashboard/front-office/readiness",
            icon: ClipboardCheck,
            label: "Arrival readiness",
            caption: "Per-villa prep status",
          },
          {
            href: "/dashboard/operations",
            icon: Sparkles,
            label: "Operations overview",
            caption: "Cross-team daily picture",
          },
        ].map(({ href, icon: Icon, label, caption }) => (
          <Link
            key={href}
            href={href}
            className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
          >
            <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-coral-soft border border-line-soft inline-flex items-center justify-center">
              <Icon className="w-4 h-4 text-ink" strokeWidth={1.75} />
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium text-ink truncate">
                {label}
              </span>
              <span className="text-xs text-ink-tertiary truncate">
                {caption}
              </span>
            </span>
            <ArrowUpRight
              className="w-4 h-4 text-ink-tertiary shrink-0"
              strokeWidth={1.75}
            />
          </Link>
        ))}
      </div>

      <KpiRowMixed kpis={kpis} heroTone="emerald-solid" />

      <Section
        eyebrow="Today's pulse"
        title="Occupancy + readiness"
        description="Tonight's villa-by-villa fill and the share of arrivals marked ready."
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 md:gap-5">
          <HalfDonutGauge
            variant="emerald"
            value={occupancyPct}
            max={100}
            label={
              <>
                <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                  {occupancyPct}%
                </p>
                <p className="text-xs text-ink-tertiary mt-1">
                  Tonight's occupancy
                </p>
              </>
            }
            legend={[
              { label: `${occupiedToday} occupied` },
              {
                label: `${Math.max(0, totalVillas - occupiedToday)} vacant`,
                color: "var(--line-strong)",
              },
            ]}
          />
          <HalfDonutGauge
            variant="gold"
            value={
              arrivals.length > 0
                ? Math.round(
                    (arrivals.filter(
                      (a) => readinessFor(a.readinessStatus) === "ready",
                    ).length /
                      arrivals.length) *
                      100,
                  )
                : 0
            }
            max={100}
            label={
              <>
                <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                  {arrivals.length > 0
                    ? `${Math.round(
                        (arrivals.filter(
                          (a) => readinessFor(a.readinessStatus) === "ready",
                        ).length /
                          arrivals.length) *
                          100,
                      )}%`
                    : "—"}
                </p>
                <p className="text-xs text-ink-tertiary mt-1">
                  Arrivals ready
                </p>
              </>
            }
            legend={[
              {
                label: `${arrivals.filter((a) => readinessFor(a.readinessStatus) === "ready").length} ready`,
              },
              {
                label: `${arrivals.length - arrivals.filter((a) => readinessFor(a.readinessStatus) === "ready").length} pending`,
                color: "var(--line-strong)",
              },
            ]}
          />
        </div>
      </Section>

      <Section
        eyebrow="Board"
        title="Villa × day"
        description="Tonight + the next 6 days. Click a villa to open the detail surface."
        action={
          <Link
            href="/dashboard/villas"
            className="text-xs text-ink-tertiary hover:underline"
          >
            All villas →
          </Link>
        }
      >
        <RoomStatusBoard dates={board.dates} rows={boardRows} />
      </Section>

      <Section
        eyebrow="Arrivals"
        title="Today's guest arrivals"
        description="Expected check-ins with readiness pills + service-request flags."
        action={
          <Link
            href="/dashboard/front-office/arrivals"
            className="text-xs text-ink-tertiary hover:underline"
          >
            Full arrivals board →
          </Link>
        }
      >
        <GuestArrivalsList
          items={arrivalItems}
          maxVisible={8}
          moreHref="/dashboard/front-office/arrivals"
          emptyMessage="No arrivals today."
        />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Section
            eyebrow="Boards"
            title="Today's flow"
            description="Cross-link to deeper boards for arrivals, departures, and in-house guests."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <BoardCard
                href="/dashboard/front-office/arrivals"
                title="Arrivals"
                detail={`${arrivals.length} expected today`}
              />
              <BoardCard
                href="/dashboard/front-office/readiness"
                title="Arrival readiness"
                detail="Per-villa prep status + open blockers"
              />
              <BoardCard
                href="/dashboard/front-office/departures"
                title="Departures"
                detail={`${departures.length} expected today`}
              />
              <BoardCard
                href="/dashboard/front-office/in-house"
                title="In-house"
                detail={`${inHouse.length} stays right now`}
              />
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-4">
          <Section eyebrow="Inbox" title="Guest requests">
            {openRequests.length === 0 ? (
              <div className="rounded-2xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm text-ink-secondary">
                No pending check-in / check-out requests right now.
              </div>
            ) : (
              <div className="rounded-2xl border border-line-soft bg-surface shadow-soft-card p-5">
                <div className="text-display text-[40px] leading-none font-medium font-mono tabular-nums text-ink">
                  {openRequests.length}
                </div>
                <div className="text-sm text-ink-secondary mt-2">
                  awaiting review
                </div>
                <Link
                  href="/dashboard/front-office/requests"
                  className="mt-4 inline-block text-sm text-info hover:underline"
                >
                  Open requests board →
                </Link>
              </div>
            )}
          </Section>

          <Section eyebrow="Quick links" title="Operations">
            <ul className="grid grid-cols-1 gap-2">
              {[
                {
                  href: "/dashboard/operations",
                  label: "Operations overview",
                },
                { href: "/dashboard/villas", label: "Villa directory" },
                { href: "/dashboard/bookings", label: "Bookings" },
                {
                  href: "/dashboard/guest-services",
                  label: "Guest services",
                },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded-2xl border border-line-soft bg-surface px-4 py-3 text-sm text-ink shadow-soft-card hover:shadow-elevated-card hover:border-line-strong transition-all"
                  >
                    {l.label} <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section eyebrow="AI" title="Front-office copilot">
            {!copilotEnabled ? (
              <Link
                href="/dashboard/settings/ai-agents/front_office_copilot"
                className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3 hover:opacity-95 transition-opacity"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                  Coming soon · Configure key
                </span>
                <p className="text-sm leading-relaxed opacity-90">
                  The front-office-copilot agent ships with a dry-run
                  default. Wire a provider key to flip it live;
                  outputs surface here as they land.
                </p>
                <Badge tone="outline" className="self-start">
                  Configure provider →
                </Badge>
              </Link>
            ) : copilotOutputs.length === 0 ? (
              <Link
                href="/dashboard/ai/jobs?agent=front_office_copilot"
                className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3 hover:opacity-95 transition-opacity"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                  No runs yet
                </span>
                <p className="text-sm leading-relaxed opacity-90">
                  Trigger the front-office-copilot to surface today's
                  exception list across arrivals, in-house guests,
                  and open requests.
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
                    className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-5 md:p-6 flex flex-col gap-2 hover:opacity-95 transition-opacity"
                  >
                    <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                      {new Date(o.createdAt).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "numeric",
                      })}
                    </span>
                    <h4 className="text-sm font-medium line-clamp-2">
                      {o.title}
                    </h4>
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
    </div>
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
