import Link from "next/link";
import { SectionHeading } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { NoItemsYet, NoMatchingResults } from "@/components/ui/primitives";
import { listOwnerBookingSummariesForCurrentUser } from "@/features/owner-bookings/services";
import {
  publicStatusLabel,
  type OwnerBookingPublicStatus,
  type OwnerBookingSourceType,
} from "@/features/owner-bookings/calendar-pure";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "My bookings" };
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

const SOURCES: Array<{ key: OwnerBookingSourceType | "all"; label: string }> = [
  { key: "all", label: "All sources" },
  { key: "direct_booking", label: "Direct booking" },
  { key: "ota_airbnb", label: "Airbnb" },
  { key: "ota_booking_com", label: "Booking.com" },
  { key: "ota_vrbo", label: "Vrbo" },
  { key: "owner_stay", label: "Owner stay" },
  { key: "maintenance_block", label: "Maintenance" },
];

const STATUSES: Array<{
  key: OwnerBookingPublicStatus | "all";
  label: string;
}> = [
  { key: "all", label: "All statuses" },
  { key: "confirmed", label: "Confirmed" },
  { key: "in_house", label: "Guest in-house" },
  { key: "completed", label: "Completed" },
  { key: "deposit_pending", label: "Deposit pending" },
  { key: "under_review", label: "Under review" },
  { key: "owner_stay", label: "Owner stay" },
];

export default async function OwnerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; status?: string; villa?: string }>;
}) {
  const sp = await searchParams;
  const source = (sp.source ?? "all") as OwnerBookingSourceType | "all";
  const status = (sp.status ?? "all") as OwnerBookingPublicStatus | "all";
  const summaries = await listOwnerBookingSummariesForCurrentUser({
    sourceType: source === "all" ? null : source,
    publicStatus: status === "all" ? null : status,
    villaId: sp.villa ?? null,
  });

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Portfolio · bookings"
        title="My bookings"
        subtitle="Owner-safe view of every booking, hold, and owner stay across your villas. Guest names are masked; emails, phones, and provider IDs never appear here."
      />
      <p className="text-[11px] text-ink-tertiary leading-relaxed max-w-3xl">
        Each row is a stay. Source describes where it came from —{" "}
        <span className="text-ink-secondary">direct</span> = booked via
        Arconique, <span className="text-ink-secondary">OTA</span> = via
        Booking.com / Airbnb / similar,{" "}
        <span className="text-ink-secondary">owner</span> = you or someone
        you authorised. Pending direct bookings remain visible until the
        deposit clears or the hold expires.
      </p>
      <div className="flex flex-wrap gap-3">
        <FilterGroup
          name="source"
          current={source}
          options={SOURCES.map((s) => ({ key: s.key, label: s.label }))}
        />
        <FilterGroup
          name="status"
          current={status}
          options={STATUSES.map((s) => ({ key: s.key, label: s.label }))}
        />
      </div>
      {summaries.length === 0 ? (
        source !== "all" || status !== "all" || sp.villa ? (
          <NoMatchingResults resetHref="/owner/bookings" />
        ) : (
          <NoItemsYet
            entityLabel="bookings"
            description="No bookings on your villas yet. Bookings will appear here as they're confirmed via direct booking, OTAs, or owner stays."
          />
        )
      ) : (
        <section>
          <div className="label">Bookings</div>
          <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
            {summaries.length} stay{summaries.length === 1 ? "" : "s"}
          </h2>
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Villa</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Owner revenue</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.id} className="border-t border-line-soft">
                    <td className="px-4 py-3">
                      <div className="text-sm text-ink">
                        {s.villaName ?? s.villaCode ?? "—"}
                      </div>
                      <div className="text-[11px] text-ink-tertiary">
                        {s.projectName ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-xs">
                      {s.checkIn} → {s.checkOut}
                      <div className="text-[11px] text-ink-tertiary">
                        {s.nights} night{s.nights === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{s.ownerLabel}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[s.publicStatus]}>
                        {publicStatusLabel(s.publicStatus)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {s.guestLabel ?? "—"}
                      {s.guestCountry && (
                        <span className="text-[11px] text-ink-tertiary ml-2">
                          · {s.guestCountry}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono tabular-nums">
                      <RevenueCell s={s} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/owner/bookings/${s.id}`}
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
        </section>
      )}
      <p className="text-xs text-ink-tertiary">
        Direct bookings are marked separately so you can see channel mix at a
        glance. Refer to your owner statements for the canonical revenue figures.
      </p>
    </div>
  );
}

function RevenueCell({
  s,
}: {
  s: {
    revenuePosted: boolean;
    statementHref: string | null;
    ownerRevenueMinor: bigint | null;
    totalAmountMinor: bigint | null;
    currency: string | null;
    publicStatus: OwnerBookingPublicStatus;
  };
}) {
  if (s.publicStatus === "owner_stay") return <span>—</span>;
  if (s.publicStatus === "blocked" || s.publicStatus === "maintenance")
    return <span>—</span>;
  if (s.publicStatus === "cancelled" || s.publicStatus === "expired") {
    return <span className="text-ink-tertiary">No revenue</span>;
  }
  if (s.revenuePosted && s.statementHref) {
    return (
      <span className="text-success">
        {s.ownerRevenueMinor !== null && s.currency
          ? formatMoneyMinor(s.ownerRevenueMinor, s.currency)
          : "Posted"}
        <Link
          href={s.statementHref}
          className="block text-[11px] text-ink hover:underline underline-offset-4 mt-0.5"
        >
          Open statement →
        </Link>
      </span>
    );
  }
  if (s.revenuePosted) {
    return <span className="text-info">Posted, statement pending</span>;
  }
  if (s.totalAmountMinor !== null && s.currency) {
    return (
      <span className="text-ink-tertiary">
        {formatMoneyMinor(s.totalAmountMinor, s.currency)}
        <span className="block text-[11px] text-ink-tertiary mt-0.5">
          Estimated · not yet posted
        </span>
      </span>
    );
  }
  return <span className="text-ink-tertiary">Pending</span>;
}

function FilterGroup({
  name,
  current,
  options,
}: {
  name: string;
  current: string;
  options: ReadonlyArray<{ key: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o) => (
        <Link
          key={o.key}
          href={`/owner/bookings?${name}=${o.key}`}
          className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
            current === o.key
              ? "bg-ink text-ink-inverse"
              : "border border-line-soft text-ink-secondary hover:border-line-strong"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
