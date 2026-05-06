import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  getOwnerBookingSummaryById,
  listOwnerBookingBreakdowns,
} from "@/features/owner-bookings/services";
import {
  buildOwnerBookingTimelineStatus,
  publicStatusLabel,
  type OwnerBookingPublicStatus,
} from "@/features/owner-bookings/calendar-pure";
import {
  formatOwnerRevenueExplanation,
  type RevenueBreakdownEntry,
} from "@/features/owner-bookings/revenue-pure";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Booking detail" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  OwnerBookingPublicStatus,
  "neutral" | "info" | "warning" | "success" | "danger" | "gold" | "accent"
> = {
  inquiry: "neutral",
  under_review: "info",
  deposit_pending: "warning",
  confirmed: "info",
  in_house: "success",
  completed: "success",
  cancelled: "neutral",
  expired: "neutral",
  blocked: "neutral",
  maintenance: "warning",
  owner_stay: "accent",
};

export default async function OwnerBookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const summary = await getOwnerBookingSummaryById(id, { ownerOnly: true });
  if (!summary) notFound();
  const breakdowns = await listOwnerBookingBreakdowns(summary.id);
  const visibleBreakdowns = breakdowns.filter((b) => b.ownerVisible);
  const timeline = buildOwnerBookingTimelineStatus({
    publicStatus: summary.publicStatus,
    sourceType: summary.sourceType,
  });
  const explanation = formatOwnerRevenueExplanation(
    {
      sourceType: summary.sourceType,
      publicStatus: summary.publicStatus,
      revenuePosted: summary.revenuePosted,
      statementId: summary.statementId,
      totalAmountMinor: summary.totalAmountMinor,
    },
    visibleBreakdowns,
  );
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/owner/bookings" },
          { label: summary.ownerLabel },
        ]}
        title={summary.villaName ?? summary.villaCode ?? "Booking"}
        description={`${summary.checkIn} → ${summary.checkOut} · ${summary.nights} night${summary.nights === 1 ? "" : "s"}`}
        actions={
          <Badge tone={STATUS_TONES[summary.publicStatus]}>
            {publicStatusLabel(summary.publicStatus)}
          </Badge>
        }
      />

      <Section eyebrow="Stay" title={timeline.headline}>
        <p className="text-sm text-ink-secondary leading-relaxed max-w-2xl">
          {timeline.body}
        </p>
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <KV label="Source" value={summary.ownerLabel} />
          <KV
            label="Channel"
            value={summary.channelLabel ?? "—"}
          />
          <KV label="Guest" value={summary.guestLabel ?? "—"} />
          <KV label="Country" value={summary.guestCountry ?? "—"} />
          <KV
            label="Guests"
            value={summary.guestCount ? String(summary.guestCount) : "—"}
          />
          <KV label="Project" value={summary.projectName ?? "—"} />
          <KV label="Villa" value={summary.villaCode ?? "—"} />
          <KV
            label="Updated"
            value={
              summary.sourceUpdatedAt
                ? new Date(summary.sourceUpdatedAt)
                    .toISOString()
                    .slice(0, 10)
                : "—"
            }
          />
        </div>
      </Section>

      <Section
        eyebrow="Revenue transparency"
        title="How this booking affects your statement"
      >
        <div className="rounded-md border border-line-soft bg-muted/30 p-5">
          <p className="text-sm text-ink leading-relaxed">{explanation}</p>
          {summary.statementHref && (
            <Link
              href={summary.statementHref}
              className="text-xs text-ink hover:underline underline-offset-4 mt-3 inline-block"
            >
              Open the matching statement →
            </Link>
          )}
        </div>
        {visibleBreakdowns.length > 0 ? (
          <div className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-2">
            {visibleBreakdowns.map((b, i) => (
              <BreakdownRow key={i} entry={b} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-tertiary">
            No revenue breakdown is available for this booking yet.
          </p>
        )}
      </Section>

      <p className="text-xs text-ink-tertiary">
        We never expose guest contact information, hold tokens, payment
        provider IDs, or finance system identifiers in the owner portal.
      </p>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}

function BreakdownRow({ entry }: { entry: RevenueBreakdownEntry }) {
  const sign =
    entry.direction === "deduction" ? -1n : entry.direction === "neutral" ? 0n : 1n;
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 py-1.5">
      <div>
        <div className="text-sm text-ink">{entry.label}</div>
        <div className="text-[11px] text-ink-tertiary capitalize">
          {entry.category.replace(/_/g, " ")} · {entry.direction}
        </div>
      </div>
      <div
        className={`font-mono tabular-nums text-sm text-right whitespace-nowrap ${
          sign < 0n ? "text-ink-secondary" : "text-ink"
        }`}
      >
        {sign === 0n
          ? "—"
          : `${sign < 0n ? "-" : ""}${formatMoneyMinor(
              entry.amountMinor,
              entry.currency,
            )}`}
      </div>
    </div>
  );
}
