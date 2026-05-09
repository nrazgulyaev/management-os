import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import {
  listArrivals,
  listDepartures,
  listInHouseGuests,
  listCheckinCheckoutRequests,
} from "@/features/front-office/services";

export const metadata = { title: "Front office" };
export const dynamic = "force-dynamic";

export default async function FrontOfficeTodayPage() {
  const today = new Date();
  const [arrivals, departures, inHouse, openRequests] = await Promise.all([
    listArrivals(today),
    listDepartures(today),
    listInHouseGuests(today),
    listCheckinCheckoutRequests({ status: "requested", limit: 50 }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Front office" }, { label: "Today" }]}
        title="Front office"
        description="Arrivals, departures, in-house guests, and pending check-in / check-out requests for the current operating day."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Arrivals today" value={String(arrivals.length)} />
        <MetricCard label="Departures today" value={String(departures.length)} />
        <MetricCard label="In-house" value={String(inHouse.length)} />
        <MetricCard
          label="Pending requests"
          value={String(openRequests.length)}
          accent={openRequests.length > 0}
        />
      </div>

      <Section eyebrow="Boards" title="Jump to a board">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card href="/dashboard/front-office/arrivals" title="Arrivals" detail={`${arrivals.length} expected today`} />
          <Card
            href="/dashboard/front-office/readiness"
            title="Arrival readiness"
            detail="Per-villa prep status + open blockers"
          />
          <Card href="/dashboard/front-office/departures" title="Departures" detail={`${departures.length} expected today`} />
          <Card href="/dashboard/front-office/in-house" title="In-house" detail={`${inHouse.length} stays right now`} />
          <Card href="/dashboard/front-office/requests" title="Check-in / check-out requests" detail={`${openRequests.length} awaiting review`} />
        </div>
      </Section>
    </div>
  );
}

function Card({ href, title, detail }: { href: string; title: string; detail: string }) {
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
