import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { listGuestServiceRatings } from "@/features/service-fulfilment/services";
import {
  FlagRatingButton,
  HideRatingButton,
} from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Guest service ratings" };
export const dynamic = "force-dynamic";

export default async function RatingsPage() {
  const rows = await listGuestServiceRatings({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/service-fulfilment">Service fulfilment</Link> /{" "}
            <span>Ratings</span>
          </div>
          <h1>Guest service ratings</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Post-fulfilment feedback. Vendor averages on the vendor profile auto-update from these rows.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Feedback</div>
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
                    <HandoffBadge
                      tone={
                        r.status === "published"
                          ? "ok"
                          : r.status === "flagged"
                            ? "warn"
                            : "soft"
                      }
                    >
                      {r.status}
                    </HandoffBadge>
                  </td>
                  <td className="px-4 py-3">
                    {r.status !== "hidden" && (
                      <div className="flex items-center gap-3">
                        {r.status === "published" && (
                          <HideRatingButton id={r.id} />
                        )}
                        {r.status !== "flagged" && (
                          <FlagRatingButton id={r.id} />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
