import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listGuestServiceRatings } from "@/features/service-fulfilment/services";
import { HideRatingButton } from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Guest service ratings" };
export const dynamic = "force-dynamic";

export default async function RatingsPage() {
  const rows = await listGuestServiceRatings({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Service fulfilment", href: "/dashboard/service-fulfilment" },
          { label: "Ratings" },
        ]}
        title="Guest service ratings"
        description="Post-fulfilment feedback. Vendor averages on the vendor profile auto-update from these rows."
      />
      <Section eyebrow="Feedback" title={`${rows.length} ratings`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Comment</th>
                <th className="px-4 py-3">Sentiment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-tertiary">
                    No ratings yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-sm">
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-tertiary">
                    {r.comment ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">
                    {r.sentiment ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        r.status === "published"
                          ? "success"
                          : r.status === "flagged"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "published" && <HideRatingButton id={r.id} />}
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
