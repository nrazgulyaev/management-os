import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listGuestReviewRequests } from "@/features/guest-journey/services";
import { RunReviewRequestsButton } from "@/components/guest-journey/journey-buttons";

export const metadata = { title: "Review requests" };
export const dynamic = "force-dynamic";

export default async function ReviewRequestsAdminPage() {
  const rows = await listGuestReviewRequests({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest journey", href: "/dashboard/guest-journey" },
          { label: "Review requests" },
        ]}
        title="Post-stay review requests"
        description="Channel is picked deterministically from the booking's distribution channel: Airbnb / Booking.com → OTA review surface; direct / manual → /stay/[token]/review."
        actions={<RunReviewRequestsButton />}
      />
      <Section eyebrow="Tracking" title={`${rows.length} requests`}>
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Clicked</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No review requests yet.
                  </td>
                </tr>
              )}
              {rows.map(({ request: r, bookingCode, villaCode }) => (
                <tr key={r.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">
                    {bookingCode ?? r.bookingId?.slice(0, 8) ?? "—"}
                    <div className="text-[10px] text-ink-tertiary">
                      {villaCode ?? ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.channel}</td>
                  <td className="px-4 py-3 text-xs capitalize">
                    {r.requestStage.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {r.sentAt?.toISOString() ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {r.clickedAt?.toISOString() ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        r.status === "completed"
                          ? "success"
                          : r.status === "sent" || r.status === "clicked"
                            ? "info"
                            : r.status === "skipped"
                              ? "warning"
                              : r.status === "failed"
                                ? "danger"
                                : "neutral"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
