import Link from "next/link";
import { NewByTypeForm } from "./form";
import { listBookingChannels } from "@/features/channels/services";

export const metadata = { title: "Book by type" };
export const dynamic = "force-dynamic";

export default async function NewByTypePage() {
  const channels = await listBookingChannels().catch(() => []);
  return (
    <div className="flex flex-col gap-6">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> / <span>Book by type</span>
          </div>
          <h1>Book by villa type</h1>
        </div>
      </div>
      <p className="text-sm text-ink-secondary max-w-[680px]">
        Pick the dates and a villa type — we auto-assign a free villa of that type.
        Types with no free villa for those dates aren&rsquo;t offered, and the
        booking is re-checked against the calendar before it&rsquo;s created.
      </p>
      <NewByTypeForm channels={channels.map((c) => ({ id: c.id, label: c.name }))} />
    </div>
  );
}
