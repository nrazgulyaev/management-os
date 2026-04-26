import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { CalendarFeedForm } from "@/components/integrations/feed-form";
import { listVillas } from "@/features/villas/services";
import { getDb } from "@/lib/db/client";
import { bookingChannels } from "@/lib/db/schema/bookings";
import { asc } from "drizzle-orm";

export const metadata = { title: "New calendar feed" };
export const dynamic = "force-dynamic";

async function listChannels() {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(bookingChannels).orderBy(asc(bookingChannels.name));
  return rows.map((c) => ({ id: c.id, name: c.name }));
}

export default async function NewCalendarFeedPage() {
  const [villas, channels] = await Promise.all([listVillas(), listChannels()]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Integrations", href: "/dashboard/integrations" },
          { label: "Calendar feeds", href: "/dashboard/integrations/calendar-feeds" },
          { label: "New" },
        ]}
        title="Add calendar feed"
      />
      <DbStatusNotice />
      <CalendarFeedForm
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        channels={channels.map((c) => ({ id: c.id, label: c.name }))}
        cancelHref="/dashboard/integrations/calendar-feeds"
      />
    </div>
  );
}
