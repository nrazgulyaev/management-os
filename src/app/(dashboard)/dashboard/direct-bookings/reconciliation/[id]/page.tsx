import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { getDirectBookingFinanceLinkById } from "@/features/direct-booking/finance-reconciliation";
import { directBookingFinanceStatusLabel } from "@/features/direct-booking/finance-pure";
import { requireOrgId } from "@/features/auth/require-org";
import { ReverseLinkForm } from "@/components/direct-booking/reconcile-buttons";

export const metadata = { title: "Finance link" };
export const dynamic = "force-dynamic";

/** Map the finance status-label tones onto handoff badge tones. */
const BADGE_TONE: Record<
  "info" | "success" | "warning" | "neutral" | "danger",
  "info" | "ok" | "warn" | "soft" | "danger"
> = {
  info: "info",
  success: "ok",
  warning: "warn",
  neutral: "soft",
  danger: "danger",
};

export default async function FinanceLinkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizationId = await requireOrgId();
  const link = await getDirectBookingFinanceLinkById(id, organizationId);
  if (!link) notFound();
  type LinkStatus = Parameters<typeof directBookingFinanceStatusLabel>[0];
  const lab = directBookingFinanceStatusLabel(link.status as LinkStatus);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <Link href="/dashboard/direct-bookings/reconciliation">
              Reconciliation
            </Link>{" "}
            / <span>{link.linkCode}</span>
          </div>
          <h1>{link.linkCode}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${link.currency} · ${(link.grossAmountMinor / 100n).toString()}.${String(link.grossAmountMinor % 100n).padStart(2, "0")} gross`}
          </p>
        </div>
        <div className="actions">
          <HandoffBadge tone={BADGE_TONE[lab.tone]}>{lab.label}</HandoffBadge>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Summary</div>
        <Card padding="default">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Pair
              label="Gross"
              value={`${formatMinor(link.grossAmountMinor)} ${link.currency}`}
              mono
            />
            <Pair
              label="Deposit"
              value={`${formatMinor(link.depositAmountMinor)} ${link.currency}`}
              mono
            />
            <Pair
              label="Balance due"
              value={`${formatMinor(link.balanceDueMinor)} ${link.currency}`}
              mono
            />
            <Pair
              label="Posted"
              value={link.postedAt?.toISOString() ?? "—"}
              mono
            />
            <Pair
              label="Reversed"
              value={link.reversedAt?.toISOString() ?? "—"}
              mono
            />
            <Pair label="Currency" value={link.currency} mono />
          </dl>
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">Joins</div>
        <Card padding="none">
          <ul className="divide-y divide-line-soft">
            <Row label="Request" value={link.requestId ?? "—"} />
            {link.bookingId && (
              <Row
                label="Booking"
                link={`/dashboard/bookings/${link.bookingId}`}
                value={link.bookingId}
              />
            )}
            {link.depositId && (
              <Row
                label="Deposit"
                link={`/dashboard/direct-bookings/deposits/${link.depositId}`}
                value={link.depositId}
              />
            )}
            {link.holdId && (
              <Row
                label="Hold"
                link={`/dashboard/direct-bookings/holds/${link.holdId}`}
                value={link.holdId}
              />
            )}
            {link.revenueLineId && (
              <Row label="Revenue line" value={link.revenueLineId} />
            )}
            {link.statementPeriodId && (
              <Row label="Statement period" value={link.statementPeriodId} />
            )}
          </ul>
        </Card>
      </div>
      {link.error && (
        <div>
          <div className="label mb-2.5">Error</div>
          <Card padding="default">
            <p className="text-sm text-danger m-0">{link.error}</p>
          </Card>
        </div>
      )}
      {link.status === "posted" && (
        <div>
          <div className="label mb-2.5">Reverse</div>
          <Card padding="default">
            <ReverseLinkForm id={link.id} />
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-xs text-ink-tertiary">{label}</span>
      {link ? (
        <Link
          href={link}
          className="font-mono text-xs text-ink hover:underline underline-offset-4 break-all"
        >
          {value}
        </Link>
      ) : (
        <span className="font-mono text-xs text-ink break-all">{value}</span>
      )}
    </li>
  );
}

function formatMinor(amount: bigint): string {
  const major = amount / 100n;
  const rest = amount % 100n;
  return `${major.toString()}.${String(rest).padStart(2, "0")}`;
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </dt>
      <dd className={`mt-1 text-ink ${mono ? "font-mono text-xs break-all" : "text-sm"}`}>
        {value}
      </dd>
    </div>
  );
}
