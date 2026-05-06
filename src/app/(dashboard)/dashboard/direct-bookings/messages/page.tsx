import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listAdminThreads } from "@/features/direct-booking/guest-messages";

export const metadata = { title: "Direct booking messages" };
export const dynamic = "force-dynamic";

export default async function GuestMessagesInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "open" | "closed" | "archived" }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const threads = await listAdminThreads({ status });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Messages" },
        ]}
        title="Direct booking guest messages"
        description="Concierge ↔ guest threads attached to a direct booking request, hold, or confirmed booking."
      />
      <div className="flex flex-wrap gap-2">
        {(["open", "closed", "archived"] as const).map((s) => (
          <Link
            key={s}
            href={`/dashboard/direct-bookings/messages?status=${s}`}
            className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
              status === s
                ? "bg-ink text-ink-inverse"
                : "border border-line-soft text-ink-secondary hover:border-line-strong"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>
      <Section
        eyebrow="Threads"
        title={`${threads.length} ${status} thread${threads.length === 1 ? "" : "s"}`}
      >
        {threads.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-sm text-ink-tertiary">
            No threads in this state.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Thread</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Unread (staff)</th>
                  <th className="px-4 py-3">Last message</th>
                  <th className="px-4 py-3">Last by guest</th>
                  <th className="px-4 py-3">Last by staff</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {threads.map((t) => (
                  <tr key={t.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-mono text-xs text-ink-tertiary">
                      {t.id.slice(0, 8)}…
                      <div className="text-[10px] mt-0.5">
                        {t.requestId
                          ? `request ${t.requestId.slice(0, 8)}`
                          : t.holdId
                            ? `hold ${t.holdId.slice(0, 8)}`
                            : t.bookingId
                              ? `booking ${t.bookingId.slice(0, 8)}`
                              : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          t.status === "open"
                            ? "info"
                            : t.status === "closed"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {t.staffUnreadCount > 0 ? (
                        <Badge tone="warning">{t.staffUnreadCount}</Badge>
                      ) : (
                        <span className="text-ink-tertiary">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                      {t.lastMessageAt?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                      {t.lastGuestMessageAt?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                      {t.lastStaffMessageAt?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/direct-bookings/messages/${t.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
