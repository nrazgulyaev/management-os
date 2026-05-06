import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  getDepositById,
  listDepositEvents,
} from "@/features/direct-booking/deposits";
import { adminDepositStatusLabel } from "@/features/direct-booking/deposits-pure";
import {
  CancelDepositButton,
  MarkDepositFailedForm,
  MarkDepositPaidButton,
  RefundDepositPlaceholderButton,
} from "@/components/direct-booking/deposit-buttons";

export const metadata = { title: "Deposit detail" };
export const dynamic = "force-dynamic";

export default async function DepositDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deposit = await getDepositById(id);
  if (!deposit) notFound();
  const events = await listDepositEvents(id);
  type DepStatus = Parameters<typeof adminDepositStatusLabel>[0];
  const lab = adminDepositStatusLabel(deposit.status as DepStatus);
  const isPayable =
    deposit.status === "draft" ||
    deposit.status === "pending" ||
    deposit.status === "requires_action";
  const isPaid =
    deposit.status === "paid" || deposit.status === "manually_marked_paid";
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Deposits", href: "/dashboard/direct-bookings/deposits" },
          { label: deposit.depositCode },
        ]}
        title={deposit.depositCode}
        description={`${deposit.providerKey} · ${deposit.currency}`}
        actions={<Badge tone={lab.tone}>{lab.label}</Badge>}
      />
      <Section eyebrow="Summary" title="Deposit">
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Pair
            label="Amount"
            value={`${(deposit.amountMinor / 100n).toString()}.${String(deposit.amountMinor % 100n).padStart(2, "0")} ${deposit.currency}`}
            mono
          />
          <Pair label="Provider" value={deposit.providerKey} mono />
          <Pair
            label="Session ID"
            value={deposit.providerSessionId ?? "—"}
            mono
          />
          <Pair
            label="Payment URL"
            value={deposit.paymentUrl ?? "—"}
            mono
          />
          <Pair
            label="Expires"
            value={deposit.expiresAt?.toISOString() ?? "—"}
            mono
          />
          <Pair
            label="Paid at"
            value={deposit.paidAt?.toISOString() ?? "—"}
            mono
          />
        </dl>
        {deposit.requestId && (
          <Link
            href={`/dashboard/direct-bookings/requests/${deposit.requestId}`}
            className="mt-3 inline-block text-xs text-ink underline underline-offset-4"
          >
            Open linked request →
          </Link>
        )}
      </Section>
      <Section eyebrow="Actions" title="Manage">
        <div className="flex flex-col gap-3">
          {isPayable && <MarkDepositPaidButton id={deposit.id} />}
          {isPayable && <MarkDepositFailedForm id={deposit.id} />}
          {isPayable && <CancelDepositButton id={deposit.id} />}
          {isPaid && <RefundDepositPlaceholderButton id={deposit.id} />}
        </div>
      </Section>
      <Section eyebrow="Timeline" title={`${events.length} events`}>
        {events.length === 0 ? (
          <p className="text-xs text-ink-tertiary">No events yet.</p>
        ) : (
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {events.map((e) => (
              <li key={e.id} className="px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink font-medium">
                    {e.eventType.replace(/_/g, " ")}
                  </span>
                  <span className="text-[11px] font-mono text-ink-tertiary">
                    {e.createdAt.toISOString()}
                  </span>
                </div>
                <span className="text-xs text-ink-tertiary capitalize">
                  {e.actorType}
                  {e.message ? ` — ${e.message}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Pair({
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
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </dt>
      <dd className={`mt-1 text-ink ${mono ? "font-mono text-xs break-all" : "text-sm"}`}>
        {value}
      </dd>
    </div>
  );
}
