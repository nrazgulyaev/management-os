import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { PortfolioOverview } from "@/components/dashboard/portfolio-overview";
import { DashboardPulse } from "@/components/dashboard/dashboard-pulse";
import { LivePulseStrip } from "@/components/dashboard/live-pulse-strip";
import { getLiveDashboardCounts } from "@/features/dashboard/live-counts";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { mockVillas } from "@/lib/mock/villas";
import {
  housekeepingTasks,
  maintenanceTickets,
} from "@/lib/mock/operations";
import { ArrowUpRight, Wallet, ShieldCheck, Sparkles } from "lucide-react";

export const metadata = { title: "Portfolio overview" };

export default async function DashboardHome() {
  const liveCounts = await getLiveDashboardCounts();
  const arrivalsToday = mockVillas.filter(
    (v) => v.nextArrival?.dateISO === "2026-04-25"
  );
  const departuresToday = mockVillas.filter(
    (v) => v.nextDeparture?.dateISO === "2026-04-24" || v.nextDeparture?.dateISO === "2026-04-25"
  );
  const slaWarn = maintenanceTickets.filter((t) => t.sla === "warn").length;
  const awaitingApproval = housekeepingTasks.filter(
    (t) => t.status === "awaiting_approval"
  ).length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Saturday · 25 April 2026"
        title="Portfolio in good standing."
        description={`19 villas across three projects. ${arrivalsToday.length} arrivals and ${departuresToday.length} departures today. ${slaWarn} SLA warning${slaWarn === 1 ? "" : "s"} on maintenance, ${awaitingApproval} checklist${awaitingApproval === 1 ? "" : "s"} awaiting supervisor.`}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/dashboard/finance">
                <Wallet className="w-4 h-4" strokeWidth={1.75} />
                Finance
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/operations">
                <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                Ops board
              </Link>
            </Button>
          </div>
        }
      />

      {liveCounts && (
        <Section
          eyebrow="Live counts"
          title="Core entities"
          description="Live from the database. Each tile reflects what's currently in your system."
        >
          <LivePulseStrip counts={liveCounts} />
        </Section>
      )}

      <DashboardPulse />

      <Section
        eyebrow="KPIs"
        title="Portfolio performance"
        description="MTD + YoY · weighted across Eternal, Enso, and Ahau."
      >
        <PortfolioOverview />
      </Section>

      <Section
        eyebrow="Tonight"
        title="Tonight's villa pulse"
        description="Live from the status board. Tap to open."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/villas">All villas</Link>
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {mockVillas.slice(0, 8).map((v) => (
            <div
              key={v.id}
              className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-tertiary">
                  {v.code}
                </span>
                <StatusPill status={v.status} />
              </div>
              <div>
                <div className="text-ink text-sm font-medium">{v.name}</div>
                <div className="text-xs text-ink-tertiary">{v.project}</div>
              </div>
              <div className="pt-3 mt-auto border-t border-line-soft flex items-baseline justify-between">
                <span className="text-[11px] text-ink-tertiary">MTD revenue</span>
                <span className="font-mono tabular-nums text-sm text-ink">
                  Rp {(v.mtdRevenue / 100_000_000).toFixed(1)}M
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Operational health"
        title="Today's task surface"
        description="The handful of items the team should care about right now."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-line-soft flex items-center justify-between">
              <span className="text-label">Housekeeping queue</span>
              <Badge tone="outline">{housekeepingTasks.length} active</Badge>
            </div>
            <ul className="divide-y divide-line-soft">
              {housekeepingTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-ink truncate">
                      {t.villa} · {t.assignee}
                    </div>
                    <div className="text-[11px] text-ink-tertiary tabular-nums mt-0.5">
                      {t.scheduledAt} · {t.checklistDone}/{t.checklistTotal} items
                    </div>
                  </div>
                  <Badge
                    tone={
                      t.status === "awaiting_approval"
                        ? "warning"
                        : t.status === "in_progress"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {t.status === "awaiting_approval"
                      ? "Awaiting approval"
                      : t.status === "in_progress"
                        ? "In progress"
                        : "Queued"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-line-soft flex items-center justify-between">
              <span className="text-label">Maintenance · open</span>
              <Badge tone="outline">{maintenanceTickets.length} tickets</Badge>
            </div>
            <ul className="divide-y divide-line-soft">
              {maintenanceTickets.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-ink truncate">{t.title}</div>
                    <div className="text-[11px] text-ink-tertiary mt-0.5">
                      {t.villaCode} · {t.openedAgo} · {t.assignee ?? "Unassigned"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        t.priority === "p1"
                          ? "danger"
                          : t.priority === "p2"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {t.priority.toUpperCase()}
                    </Badge>
                    {t.sla === "warn" && (
                      <Badge tone="warning">SLA warn</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Finance"
        title="Owner payouts queued for this period"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/finance">Open finance</Link>
          </Button>
        }
      >
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-line-soft flex items-center justify-between">
            <span className="text-label">Pending payouts · March 2026</span>
            <span className="font-mono tabular-nums text-sm text-ink">
              Rp 742M · 7 owners
            </span>
          </div>
          <ul className="divide-y divide-line-soft">
            {[
              { name: "Emma Whitmore · EV-07", net: "Rp 78.0M", status: "Approved · awaiting send" },
              { name: "Emma Whitmore · ES-S5", net: "Rp 91.4M", status: "Approved · awaiting send" },
              { name: "Takeda Family Office · Enso pool", net: "Rp 256.8M", status: "Awaiting Director" },
              { name: "Sonoma Capital · Enso pool", net: "Rp 217.2M", status: "Awaiting Director" },
              { name: "Larsen Holdings · Ahau 02", net: "Rp 49.6M", status: "Awaiting Finance" },
            ].map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <span className="text-sm text-ink truncate">{p.name}</span>
                <div className="flex items-center gap-4">
                  <span className="font-mono tabular-nums text-sm text-ink">
                    {p.net}
                  </span>
                  <Badge
                    tone={
                      p.status.includes("Director")
                        ? "warning"
                        : p.status.includes("Finance")
                          ? "info"
                          : "success"
                    }
                  >
                    {p.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section
        eyebrow="AI"
        title="Operations Copilot · today"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/ai">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
              All assistants
            </Link>
          </Button>
        }
      >
        <div className="rounded-lg border border-accent/15 bg-accent-weak/40 p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-md bg-ink text-ink-inverse inline-flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-ink">
                AM briefing — modelled
              </span>
              <Badge tone="outline">Preview</Badge>
            </div>
            <p className="text-sm text-ink leading-relaxed">
              Three arrivals on the books, all on track except{" "}
              <strong>EV-07</strong>, where the supervisor approval has not yet
              cleared (cleaner reports 22 of 22 items with photos). Enso S6
              remains blocked on pool parts; vendor ETA Friday morning. ES-S2
              housekeeping is on schedule for the 15:00 check-in.
            </p>
            <ul className="flex flex-col gap-1.5 text-xs text-ink-secondary mt-3">
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-ink-tertiary" />
                Suggested: clear EV-07 supervisor review to hold 15:00 check-in.
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-ink-tertiary" />
                Suggested: move ES-S6 ticket to Day 2; reassign tech to ES-S2.
              </li>
            </ul>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <Button asChild size="sm" variant="secondary">
                <Link href="/dashboard/ai">
                  Open Operations Copilot
                  <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                </Link>
              </Button>
              <span className="text-[11px] text-ink-tertiary">
                Briefing not yet wired. AI runtime arrives in Version 4.
              </span>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
