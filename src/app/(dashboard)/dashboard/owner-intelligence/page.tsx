import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DashboardKpi } from "@/components/ui/primitives";
import { listOwnerVillaHealthSnapshots } from "@/features/owner-intelligence/health-services";
import { listAdminReviews } from "@/features/owner-intelligence/reviews-services";

export const metadata = { title: "Owner intelligence" };
export const dynamic = "force-dynamic";

export default async function OwnerIntelligenceHub() {
  const [snapshots, recentReviews] = await Promise.all([
    listOwnerVillaHealthSnapshots(),
    listAdminReviews({ limit: 50 }),
  ]);
  const attention = snapshots.filter(
    (s) => s.healthStatus === "attention" || s.healthStatus === "watch",
  );
  const negative = recentReviews.filter(
    (r) => r.sentiment === "negative" || (r.rating ?? 5) < 3.5,
  );
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Owner intelligence" }]}
        title="Owner intelligence"
        description="Owner calendar, villa health snapshots, and review management. The owner-side projection (in /owner/calendar, /owner/villas/[id]/health, etc.) only ever sees the owner-safe shape — guests' contact info and access secrets stay internal."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpi
          label="Snapshots stored"
          value={String(snapshots.length)}
          status="neutral"
          hint="Cached owner-safe villa-health computations"
        />
        <DashboardKpi
          label="Villas needing attention"
          value={String(attention.length)}
          status={attention.length > 0 ? "bad" : "good"}
          hint={attention.length > 0 ? "Health watch or attention status" : "All villas in good or excellent shape"}
        />
        <DashboardKpi
          label="Negative reviews"
          value={String(negative.length)}
          status={negative.length > 0 ? "warn" : "good"}
          hint="Sentiment negative or rating < 3.5"
        />
        <DashboardKpi
          label="Recent reviews"
          value={String(recentReviews.length)}
          status="neutral"
          hint="Last 50 reviews on file"
        />
      </div>
      <Section eyebrow="Manage" title="Jump to">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card
            href="/dashboard/owner-intelligence/calendar"
            title="Calendar"
            detail="Internal calendar with full villa context"
          />
          <Card
            href="/dashboard/owner-intelligence/health"
            title="Health reports"
            detail={`${snapshots.length} snapshots`}
          />
          <Card
            href="/dashboard/owner-intelligence/reviews"
            title="Reviews"
            detail={`${recentReviews.length} on file`}
          />
          <Card
            href="/dashboard/owner-intelligence/preferences"
            title="Owner preferences"
            detail="Calendar display defaults per owner"
          />
          <Card
            href="/dashboard/owner-intelligence/bookings"
            title="Booking projection"
            detail="Owner-safe booking summaries that back /owner/bookings"
          />
          <Card
            href="/dashboard/owner-intelligence/revenue"
            title="Revenue source mix"
            detail="Direct vs OTA per owner / villa / month"
          />
        </div>
      </Section>
      {attention.length > 0 && (
        <Section
          eyebrow="Action needed"
          title={`${attention.length} villa${attention.length === 1 ? "" : "s"} on watch / attention`}
        >
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {attention.slice(0, 10).map((s) => (
              <li
                key={s.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <Link
                  href={`/dashboard/owner-intelligence/health/${s.villaId}`}
                  className="text-sm text-ink hover:underline underline-offset-4"
                >
                  Villa {s.villaId.slice(0, 8)}
                </Link>
                <span className="flex items-center gap-2 text-xs">
                  <Badge
                    tone={
                      s.healthStatus === "attention" ? "danger" : "warning"
                    }
                  >
                    {s.healthStatus}
                  </Badge>
                  <span className="font-mono tabular-nums text-ink-tertiary">
                    {s.healthScore !== null ? Number(s.healthScore).toFixed(0) : "—"}
                    /100
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Card({
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
      className="rounded-md border border-line-soft bg-surface p-5 hover:border-line-strong transition-colors block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
