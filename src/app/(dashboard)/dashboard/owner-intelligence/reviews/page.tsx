import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listAdminReviews } from "@/features/owner-intelligence/reviews-services";
import {
  HideReviewButton,
  PublishReviewButton,
} from "@/components/owner-intelligence/snapshot-buttons";

export const metadata = { title: "Guest reviews" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  draft: "neutral",
  published: "success",
  hidden: "warning",
  flagged: "danger",
};

const SENTIMENT_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "danger"
> = {
  positive: "info",
  neutral: "neutral",
  mixed: "warning",
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
      <PageHeader
        breadcrumbs={[
          {
            label: "Owner intelligence",
            href: "/dashboard/owner-intelligence",
          },
          { label: "Reviews" },
        ]}
        title="Guest reviews"
        description="Manage which reviews are visible to owners. Hidden / flagged rows never reach the owner portal — even when the underlying booking is owned by them."
      />
      <Section eyebrow="Filter" title={`${reviews.length} reviews`}>
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
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Villa</th>
                <th className="px-4 py-3">Reviewer</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Sentiment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reviews.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No reviews match.
                  </td>
                </tr>
              )}
              {reviews.map((r) => (
                <tr key={r.id} className="border-t border-line-soft align-top">
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {r.reviewDate ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.villaCode ?? "—"}
                    {r.projectName && (
                      <div className="text-[10px] text-ink-tertiary">
                        {r.projectName}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.reviewerDisplayName ?? "Guest"}
                    {r.reviewerCountry && (
                      <span className="text-[10px] text-ink-tertiary ml-2">
                        · {r.reviewerCountry}
                      </span>
                    )}
                    {r.text && (
                      <div className="text-[11px] text-ink-secondary mt-1 max-w-md">
                        {r.text.length > 140
                          ? r.text.slice(0, 140) + "…"
                          : r.text}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {r.rating !== null ? r.rating.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.sentiment ? (
                      <Badge tone={SENTIMENT_TONES[r.sentiment] ?? "neutral"}>
                        {r.sentiment}
                      </Badge>
                    ) : (
                      <span className="text-xs text-ink-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
                      {r.status}
                    </Badge>
                    {!r.ownerVisible && (
                      <span className="text-[10px] text-ink-tertiary ml-2">
                        owner-hidden
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{r.source}</td>
                  <td className="px-4 py-3 text-right space-y-1">
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
        </div>
      </Section>
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
