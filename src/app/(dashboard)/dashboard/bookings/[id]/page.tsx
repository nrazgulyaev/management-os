import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { getBookingById } from "@/features/bookings/services";

export const metadata = { title: "Booking" };

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const b = await getBookingById(id);
  if (!b) notFound();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: b.bookingCode },
        ]}
        eyebrow={b.villaCode}
        title={b.bookingCode}
        description={`${b.guestName} · ${b.nights} night${b.nights === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge source={b.source} />
            <Badge tone="success">{b.status.replace("_", " ")}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Check-in" value={b.checkIn} mono />
        <Stat label="Check-out" value={b.checkOut} mono />
        <Stat label="Currency" value={b.currency} mono />
        <Stat label="Channel" value={b.channelName ?? "Direct"} />
      </div>

      <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-line-soft">
          <span className="text-label">Money</span>
        </div>
        <table className="w-full text-sm">
          <tbody className="[&_tr]:border-b [&_tr]:border-line-soft [&_tr:last-child]:border-0">
            <Row label="Gross" amount={b.grossAmount} currency={b.currency} />
            <Row label="Cleaning fee" amount={b.cleaningFeeAmount} currency={b.currency} />
            <Row label="Channel fee" amount={-b.channelFeeAmount} currency={b.currency} />
            <Row label="Payment fee" amount={-b.paymentFeeAmount} currency={b.currency} />
            <Row
              label="Net expected"
              amount={b.netExpectedAmount ?? b.grossAmount + b.cleaningFeeAmount - b.channelFeeAmount - b.paymentFeeAmount}
              currency={b.currency}
              strong
            />
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-line-soft bg-muted/30 p-5">
        <span className="text-label">Next steps</span>
        <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
          Once revenue recognition (v3) is wired this booking will produce
          revenue, fee, and tax lines on its checkout date and feed the owner
          statement automatically.
        </p>
        <Link
          href={`/dashboard/villas/${b.villaId}`}
          className="text-xs underline text-ink mt-3 inline-block hover:text-accent"
        >
          Open villa →
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <div className="text-label">{label}</div>
      <div className={`mt-1.5 text-sm text-ink ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  amount,
  currency,
  strong,
}: {
  label: string;
  amount: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <tr>
      <td className={`px-5 py-3 ${strong ? "text-ink font-medium" : "text-ink-secondary"}`}>
        {label}
      </td>
      <td
        className={`px-5 py-3 text-right font-mono tabular-nums ${strong ? "text-accent font-semibold" : "text-ink"}`}
      >
        {amount < 0 ? "−" : ""}
        {currency} {Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
    </tr>
  );
}
