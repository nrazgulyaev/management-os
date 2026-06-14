import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { CalendarFeedForm } from "@/components/integrations/feed-form";
import { listVillas } from "@/features/villas/services";
import { getDb } from "@/lib/db/client";
import { bookingChannels } from "@/lib/db/schema/bookings";
import { safeList } from "@/features/system/db-health";
import { asc } from "drizzle-orm";

export const metadata = { title: "New calendar feed" };
export const dynamic = "force-dynamic";

async function listChannels() {
  const db = getDb();
  if (!db) return [];
  const result = await safeList("listBookingChannels", () =>
    db.select().from(bookingChannels).orderBy(asc(bookingChannels.name)),
  );
  return result.value.map((c) => ({ id: c.id, name: c.name }));
}

export default async function NewCalendarFeedPage() {
  const [villas, channels] = await Promise.all([listVillas(), listChannels()]);
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/integrations">Integrations</Link> /{" "}
            <Link href="/dashboard/integrations/calendar-feeds">
              Calendar feeds
            </Link>{" "}
            / <span>New</span>
          </div>
          <h1>Add calendar feed</h1>
        </div>
      </div>
      <DbStatusNotice />
      <CalendarFeedForm
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        channels={channels.map((c) => ({ id: c.id, label: c.name }))}
        cancelHref="/dashboard/integrations/calendar-feeds"
      />
    </div>
  );
}
