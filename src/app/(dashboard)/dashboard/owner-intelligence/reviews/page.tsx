import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listAdminReviews } from "@/features/owner-intelligence/reviews-services";
import {
  HideReviewButton,
  PublishReviewButton,
} from "@/components/owner-intelligence/snapshot-buttons";

export const metadata = { title: "Guest reviews" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "soft" | "info" | "warn" | "ok" | "danger"
> = {
  draft: "soft",
  published: "ok",
  hidden: "warn",
  flagged: "danger",
};

const SENTIMENT_TONES: Record<
  string,
  "soft" | "info" | "warn" | "danger"
> = {
  positive: "info",
  neutral: "soft",
  mixed: "warn",
  negative: "danger",
};

export default async function ReviewsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string }>;
}) {
  const sp = await searchParams;
  const status =
    sp.status === "draft" ||
    sp.status === "published" ||
    sp.status === "hidden" ||
    sp.status === "flagged"
      ? sp.status
      : undefined;
  const source = sp.source || undefined;
  const reviews = await listAdminReviews({ status, source, limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-intelligence">
              Owner intelligence
            </Link>{" "}
            / <span>Reviews</span>
          </div>
          <h1>Guest reviews</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Manage which reviews are visible to owners. Hidden / flagged rows
            never reach the owner portal — even when the underlying booking is
            owned by them.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Filter · {reviews.length} reviews</div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <FilterPill
            href="/dashboard/owner-intelligence/reviews"
            active={!status && !source}
          >
            All
          </FilterPill>
          {(["published", "hidden", "flagged", "draft"] as const).map((s) => (
            <FilterPill
              key={s}
              href={`/dashboard/owner-intelligence/reviews?status=${s}`}
              active={status === s}
            >
              {s}
            </FilterPill>
          ))}
        </div>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Villa</th>
                <th scope="col">Reviewer</th>
                <th scope="col" className="num">
                  Rating
                </th>
                <th scope="col">Sentiment</th>
                <th scope="col">Status</th>
                <th scope="col">Source</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {reviews.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-ink-3">
                    No reviews match.
                  </td>
                </tr>
              )}
              {reviews.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="mono text-[12px]">{r.reviewDate ?? "—"}</td>
                  <td className="text-xs">
                    {r.villaCode ?? "—"}
                    {r.projectName && (
                      <div className="text-[10px] text-ink-3">
                        {r.projectName}
                      </div>
                    )}
                  </td>
                  <td className="text-xs">
                    {r.reviewerDisplayName ?? "Guest"}
                    {r.reviewerCountry && (
                      <span className="text-[10px] text-ink-3 ml-2">
                        · {r.reviewerCountry}
                      </span>
                    )}
                    {r.text && (
                      <div className="text-[11px] text-ink-2 mt-1 max-w-md">
                        {r.text.length > 140
                          ? r.text.slice(0, 140) + "…"
                          : r.text}
                      </div>
                    )}
                  </td>
                  <td className="num mono text-[12px]">
                    {r.rating !== null ? r.rating.toFixed(1) : "—"}
                  </td>
                  <td>
                    {r.sentiment ? (
                      <HandoffBadge tone={SENTIMENT_TONES[r.sentiment] ?? "soft"}>
                        {r.sentiment}
                      </HandoffBadge>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                  <td>
                    <HandoffBadge tone={STATUS_TONES[r.status] ?? "soft"}>
                      {r.status}
                    </HandoffBadge>
                    {!r.ownerVisible && (
                      <span className="text-[10px] text-ink-3 ml-2">
                        owner-hidden
                      </span>
                    )}
                  </td>
                  <td className="text-xs">{r.source}</td>
                  <td className="text-right space-y-1">
                    {r.ownerVisible ? (
                      <HideReviewButton id={r.id} />
                    ) : (
                      <PublishReviewButton id={r.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
        active
          ? "bg-ink text-ink-inverse"
          : "border border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {children}
    </Link>
  );
}
