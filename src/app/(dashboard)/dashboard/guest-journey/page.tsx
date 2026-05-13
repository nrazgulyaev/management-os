import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { getJourneyHubStats } from "@/features/guest-journey/services";
import {
  RunDueJourneyButton,
  RunReviewRequestsButton,
} from "@/components/guest-journey/journey-buttons";

export const metadata = { title: "Guest journey" };
export const dynamic = "force-dynamic";

export default async function GuestJourneyHub() {
  const stats = await getJourneyHubStats();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Guest journey" }]}
        title="Guest journey automation"
        description="Deterministic timed rules across pre-arrival → post-stay. Suggestions are CTAs (no purchases); review requests route by booking channel; owner visibility flows through owner_visible_events only."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Active rules" value={String(stats.activeRules)} />
        <MetricCard
          label="Paused rules"
          value={String(stats.pausedRules)}
          accent={stats.pausedRules > 0}
        />
        <MetricCard
          label="Pending runs"
          value={String(stats.pendingRuns)}
          accent={stats.pendingRuns > 0}
        />
        <MetricCard
          label="Failed runs"
          value={String(stats.failedRuns)}
          accent={stats.failedRuns > 0}
        />
        <MetricCard
          label="Active suggestions"
          value={String(stats.activeSuggestions)}
        />
        <MetricCard
          label="Pending review requests"
          value={String(stats.pendingReviewRequests)}
        />
      </div>
      <Section
        eyebrow="Operate"
        title="Run things now"
        description="Both jobs are also wired to cron — these buttons are for ad-hoc triggering."
      >
        <div className="flex flex-wrap gap-3">
          <RunDueJourneyButton />
          <RunReviewRequestsButton />
        </div>
      </Section>
      <Section eyebrow="Surfaces" title="Where to go next">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <HubLink
            href="/dashboard/guest-journey/rules"
            title="Rules"
            description="Configure / pause / archive the rule library."
          />
          <HubLink
            href="/dashboard/guest-journey/runs"
            title="Run log"
            description="Per-(booking, rule) execution history."
          />
          <HubLink
            href="/dashboard/guest-journey/suggestions"
            title="Suggestions"
            description="Guest-visible CTAs the runner has materialised."
          />
          <HubLink
            href="/dashboard/guest-journey/reviews"
            title="Review requests"
            description="Post-stay review tracking by channel."
          />
          <HubLink
            href="/dashboard/owner-intelligence/rebuild"
            title="Owner-events rebuild"
            description="Rebuild owner_visible_events for an owner / villa / window."
          />
        </div>
      </Section>
      <p className="text-xs text-ink-tertiary">
        Privacy contract: owners <Badge tone="neutral">never</Badge> read raw
        guest_journey_* tables. Owner-visible events are rebuilt nightly from
        owner-safe projections (masked guest names, no email / phone / lock
        codes).
      </p>
    </div>
  );
}

function HubLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-line-soft bg-surface p-4 shadow-soft-card hover:shadow-elevated-card hover:border-line-strong"
    >
      <div className="text-sm text-ink font-medium">{title}</div>
      <div className="text-xs text-ink-tertiary mt-1">{description}</div>
    </Link>
  );
}
