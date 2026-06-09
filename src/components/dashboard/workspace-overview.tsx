import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import type { AgentActivitySummary } from "@/features/dashboard/dashboard-cabinet-queries";

/**
 * Workspace Overview (/dashboard) section bricks — AI agents activity
 * card + Cabinet map.
 * Source of truth: cabinets/new/mgmt-workspace.html §04 + §05.
 *
 * These are the two mock sections that have no existing primitive. Both
 * are server-safe, presentational bricks: data is passed in live from the
 * page's already-fetched aggregates so the components hold no data of their
 * own.
 */

/** Maps the last run status → the agent-row dot class (workspace.css). */
function dotClass(status: string): string {
  if (status === "refused" || status === "blocked" || status === "failed") {
    return "dot warn";
  }
  if (status === "requires_review") return "dot warn";
  return "dot";
}

/** Humanises an agent's most-recent status into the mock's meta line. */
function statusMeta(status: string): string {
  switch (status) {
    case "completed":
      return "last run completed";
    case "requires_review":
      return "awaiting operator review";
    case "refused":
      return "refused · guardrail tripped";
    case "blocked":
      return "blocked · needs config";
    case "failed":
      return "failed · retry queued";
    case "running":
      return "running now";
    default:
      return status.replace(/_/g, " ");
  }
}

function timeAgoShort(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function AgentActivityCard({
  activity,
}: {
  activity: AgentActivitySummary;
}) {
  const costUsd = Number(activity.costMinorUsd) / 100;
  return (
    <Card className="p-[18px]">
      <h3 className="display-sm flex items-baseline gap-2.5 mb-1.5">
        <span>
          <em>AI agents</em> · live
        </span>
        <span className="mono ml-auto text-[10px] text-ink-3 tracking-[0.10em]">
          {activity.activeAgents} active
        </span>
      </h3>
      <p className="text-[12.5px] text-ink-3 mb-3.5 leading-[1.5]">
        What&rsquo;s run autonomously in the last 24h
        {costUsd > 0 ? ` · $${costUsd.toFixed(2)} spend` : ""}. Open any agent
        for full run history.
      </p>

      {activity.rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-4 italic m-0 py-2">
          No agent runs in the last 24 hours.
        </p>
      ) : (
        <div>
          {activity.rows.map((row) => (
            <div className="agent-row" key={row.agentKey}>
              <span className={dotClass(row.lastStatus)} aria-hidden />
              <span className="min-w-0">
                <span className="nm block truncate">{row.agentKey}</span>
                <span className="agent-meta block truncate">
                  {statusMeta(row.lastStatus)} · {timeAgoShort(row.lastRunAt)} ago
                </span>
              </span>
              <span className="ct">
                {row.runs} {row.runs === 1 ? "run" : "runs"}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/dashboard/ai"
        className="text-xs text-ink-tertiary hover:text-ink mt-3.5 inline-block"
      >
        Open AI assistants →
      </Link>
    </Card>
  );
}

/** A single quick-action — drills into the create/search surface. */
interface QuickAction {
  glyph: string;
  label: string;
  href: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { glyph: "+", label: "New booking", href: "/dashboard/bookings" },
  { glyph: "∷", label: "Issue statement", href: "/dashboard/finance/statements" },
  { glyph: "⌖", label: "Block dates", href: "/dashboard/availability" },
  { glyph: "★", label: "Comp guest", href: "/dashboard/guests" },
  { glyph: "⊕", label: "New task", href: "/dashboard/tasks" },
  { glyph: "⌕", label: "Search guest", href: "/dashboard/guests" },
];

export function QuickActions() {
  return (
    <Card className="p-[18px]">
      <h3 className="display-sm mb-3.5">Quick actions</h3>
      <div className="qa-grid">
        {QUICK_ACTIONS.map((qa) => (
          <Link key={qa.label} href={qa.href} className="qa-btn">
            <span className="ic" aria-hidden>
              {qa.glyph}
            </span>
            {qa.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

export interface CabinetMapCounts {
  villas: number;
  owners: number;
  projects: number;
  activeBookings: number;
  occupancyYtd: number;
  upcomingCheckIns: number;
  openMaintenance: number;
  housekeepingTurnovers: number;
  ownerStayRequestsPending: number;
  channelConflicts: number;
  reconciliationWarnings: number;
}

interface CabinetEntry {
  group: string;
  name: string;
  href: string;
  /** Live context line; the mockup's `.ctx`. */
  ctx: string;
  /** When true the card gets the amber "needs attention" treatment. */
  attn?: boolean;
}

function buildCabinets(c: CabinetMapCounts): CabinetEntry[] {
  return [
    {
      group: "Bookings",
      name: "Bookings",
      href: "/dashboard/bookings",
      ctx: `${c.activeBookings} active · ${c.upcomingCheckIns} check-ins 14d`,
    },
    {
      group: "Bookings",
      name: "Calendar",
      href: "/dashboard/bookings/calendar",
      ctx: `${c.occupancyYtd}% occ · YTD`,
    },
    {
      group: "Bookings",
      name: "Channels",
      href: "/dashboard/channels",
      ctx:
        c.channelConflicts > 0
          ? `${c.channelConflicts} conflict${c.channelConflicts === 1 ? "" : "s"} open`
          : "all feeds healthy",
      attn: c.channelConflicts > 0,
    },
    {
      group: "Bookings",
      name: "Rate plans",
      href: "/dashboard/bookings/rates",
      ctx: `${c.villas} villas active`,
    },
    {
      group: "Front office",
      name: "Today",
      href: "/dashboard/front-office",
      ctx: `${c.upcomingCheckIns} arriving · 14d`,
    },
    {
      group: "Operations",
      name: "Command center",
      href: "/dashboard/operations",
      ctx:
        c.openMaintenance > 0
          ? `${c.openMaintenance} open ticket${c.openMaintenance === 1 ? "" : "s"}`
          : "all clear",
      attn: c.openMaintenance > 0,
    },
    {
      group: "Guest stays",
      name: "Concierge",
      href: "/dashboard/concierge",
      ctx: `${c.activeBookings} active stays`,
    },
    {
      group: "Finance",
      name: "Finance",
      href: "/dashboard/finance",
      ctx:
        c.reconciliationWarnings > 0
          ? `${c.reconciliationWarnings} reconciliation warning${c.reconciliationWarnings === 1 ? "" : "s"}`
          : "statements current",
      attn: c.reconciliationWarnings > 0,
    },
    {
      group: "Portfolio",
      name: "Owners",
      href: "/dashboard/owners",
      ctx: `${c.owners} owner${c.owners === 1 ? "" : "s"}`,
    },
    {
      group: "Portfolio",
      name: "Villas",
      href: "/dashboard/villas",
      ctx: `${c.villas} villas`,
    },
    {
      group: "Portfolio",
      name: "Projects",
      href: "/dashboard/projects",
      ctx: `${c.projects} active project${c.projects === 1 ? "" : "s"}`,
    },
    {
      group: "Owner stays",
      name: "Requests",
      href: "/dashboard/owner-stays/requests",
      ctx:
        c.ownerStayRequestsPending > 0
          ? `${c.ownerStayRequestsPending} pending`
          : "none pending",
      attn: c.ownerStayRequestsPending > 0,
    },
    {
      group: "Inventory",
      name: "Stock command",
      href: "/dashboard/inventory",
      ctx: "per-org levels",
    },
    {
      group: "Utilities",
      name: "Readings",
      href: "/dashboard/utilities/readings",
      ctx: "meter sync",
    },
    {
      group: "Intelligence",
      name: "AI assistants",
      href: "/dashboard/ai",
      ctx: "agent activity",
    },
    {
      group: "Settings",
      name: "Settings",
      href: "/dashboard/settings",
      ctx: "per-org config",
    },
  ];
}

export function CabinetMap({ counts }: { counts: CabinetMapCounts }) {
  const cabinets = buildCabinets(counts);
  return (
    <section className="cab-map">
      <h2 className="display-md mb-[18px]">
        <em>Every cabinet</em> · with badge counts
      </h2>
      <div className="cm-grid">
        {cabinets.map((cab) => (
          <Link
            key={`${cab.group}-${cab.name}`}
            href={cab.href}
            className={"cm-card" + (cab.attn ? " has-attn" : "")}
          >
            <span className="grp">{cab.group}</span>
            <span className="nm">{cab.name}</span>
            <span className="cm-ctx">{cab.ctx}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
