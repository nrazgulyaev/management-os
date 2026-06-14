import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link>{" "}
            / <span>Rebuild</span>
          </div>
          <h1>Rebuild owner-visible events</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Manually rebuild the owner_visible_events projection for one owner,
            one villa, or all owners. The cron does this nightly across a -90d /
            +120d window.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Scope</div>
        <Card padding="default">
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
        </Card>
      </div>
    </div>
  );
}
