import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { RebuildOwnerEventsForm } from "@/components/guest-journey/journey-buttons";

export const metadata = { title: "Rebuild owner-visible events" };
export const dynamic = "force-dynamic";

export default function OwnerEventsRebuildPage() {
  const today = new Date();
  const fromDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const toDate = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner intelligence", href: "/dashboard/owner-intelligence" },
          { label: "Rebuild" },
        ]}
        title="Rebuild owner-visible events"
        description="Manually rebuild the owner_visible_events projection for one owner, one villa, or all owners. The cron does this nightly across a -90d / +120d window."
      />
      <Section eyebrow="Scope" title="Run rebuild">
        <RebuildOwnerEventsForm
          defaultFrom={fmt(fromDate)}
          defaultTo={fmt(toDate)}
        />
        <p className="text-xs text-ink-tertiary mt-3">
          The rebuild clears existing rows in the requested window before
          inserting fresh ones. Sources merged: bookings (masked guest label),
          calendar blocks, owner stays, owner-visible operations tasks,
          maintenance tickets, published reviews, issued/approved/paid
          statements, and owner-visible journey events.
        </p>
      </Section>
    </div>
  );
}
