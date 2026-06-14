import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <span>Messages</span>
          </div>
          <h1>Direct booking guest messages</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Concierge ↔ guest threads attached to a direct booking request,
            hold, or confirmed booking.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-[18px]">
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

      <div>
        <div className="label mb-2.5">
          Threads · {threads.length} {status} thread
          {threads.length === 1 ? "" : "s"}
        </div>
        {threads.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-sm text-ink-tertiary">
            No threads in this state.
          </p>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Thread</th>
                  <th scope="col">Status</th>
                  <th scope="col">Unread (staff)</th>
                  <th scope="col">Last message</th>
                  <th scope="col">Last by guest</th>
                  <th scope="col">Last by staff</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {threads.map((t) => (
                  <tr key={t.id}>
                    <td className="mono text-[12px] text-ink-tertiary">
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
                    <td>
                      <HandoffBadge
                        tone={
                          t.status === "open"
                            ? "info"
                            : t.status === "closed"
                              ? "soft"
                              : "warn"
                        }
                      >
                        {t.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-xs">
                      {t.staffUnreadCount > 0 ? (
                        <HandoffBadge tone="warn">
                          {t.staffUnreadCount}
                        </HandoffBadge>
                      ) : (
                        <span className="text-ink-tertiary">0</span>
                      )}
                    </td>
                    <td className="text-[11px] text-ink-tertiary">
                      {t.lastMessageAt?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                    <td className="text-[11px] text-ink-tertiary">
                      {t.lastGuestMessageAt?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                    <td className="text-[11px] text-ink-tertiary">
                      {t.lastStaffMessageAt?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                    <td className="text-right">
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
          </Card>
        )}
      </div>
    </>
  );
}
