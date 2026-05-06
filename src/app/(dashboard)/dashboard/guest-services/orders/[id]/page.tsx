import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getOrderById } from "@/features/guest-services/services";
import {
  describePricingModel,
  formatMinorMoney,
  type PricingModel,
} from "@/features/guest-services/pricing";
import {
  ORDER_STATUS_LABELS,
  toneForStatus,
  type OrderStatus,
} from "@/features/guest-services/status";
import {
  AddOrderNoteForm,
  BridgeOrderForm,
  OrderTransitionForm,
} from "@/components/guest-services/order-controls";
import { getFulfilmentForGuestOrder } from "@/features/service-fulfilment/services";
import { CreateFulfilmentForOrderButton } from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Order detail" };
export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOrderById(id);
  if (!detail) notFound();
  const { order, service, selectedOption, financeLink, events } = detail;
  const fulfilment = await getFulfilmentForGuestOrder(order.id);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest services", href: "/dashboard/guest-services" },
          { label: "Orders", href: "/dashboard/guest-services/orders" },
          { label: order.orderCode },
        ]}
        title={service?.name ?? "Service order"}
        description={`${order.orderCode} · ${detail.villaCode ?? "—"} · ${detail.bookingCode ?? "no booking"}`}
        actions={
          <Badge tone={toneForStatus(order.status as OrderStatus)}>
            {ORDER_STATUS_LABELS[order.status as OrderStatus]}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Section eyebrow="Request" title="Details">
            <dl className="rounded-md border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <Pair label="Service">
                {service?.name ?? "—"}
                <div className="text-[11px] text-ink-tertiary mt-0.5">
                  {service ? describePricingModel(service.pricingModel as PricingModel) : ""}
                </div>
              </Pair>
              <Pair label="Option">
                {selectedOption?.label ?? "—"}
              </Pair>
              <Pair label="Quantity">{String(order.quantity)}</Pair>
              <Pair label="Guest count">
                {order.guestCount ?? "—"}
              </Pair>
              <Pair label="Date">
                {order.requestedDate ?? "—"}
                {order.requestedTime && ` · ${order.requestedTime}`}
              </Pair>
              <Pair label="Currency">{order.currency}</Pair>
              <Pair label="Guest price">
                {formatMinorMoney(order.guestPriceMinor, order.currency)}
              </Pair>
              <Pair label="Internal cost">
                {order.internalCostMinor !== null
                  ? formatMinorMoney(order.internalCostMinor, order.currency)
                  : "—"}
              </Pair>
              <Pair label="Margin">
                {order.marginMinor !== null
                  ? formatMinorMoney(order.marginMinor, order.currency)
                  : "—"}
              </Pair>
              <Pair label="Assigned to" className="md:col-span-2">
                {detail.assignedToName ?? "Unassigned"}
              </Pair>
              <Pair label="Guest" className="md:col-span-1">
                {detail.guestDisplay ?? "—"}
              </Pair>
              {order.guestNote && (
                <Pair label="Guest note" className="md:col-span-3">
                  <span className="block text-ink-secondary whitespace-pre-wrap">
                    {order.guestNote}
                  </span>
                </Pair>
              )}
              {order.internalNote && (
                <Pair label="Internal note" className="md:col-span-3">
                  <span className="block text-ink-secondary whitespace-pre-wrap">
                    {order.internalNote}
                  </span>
                </Pair>
              )}
            </dl>
          </Section>

          <Section eyebrow="Activity" title="Timeline">
            <ol className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
              {events.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-tertiary">
                  No events yet.
                </li>
              )}
              {events.map((e) => (
                <li
                  key={e.id}
                  className="px-4 py-3 grid grid-cols-[120px_1fr_140px] gap-4 text-xs"
                >
                  <span className="font-mono text-ink-tertiary">
                    {new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                  <span>
                    <span className="text-ink font-medium">{e.eventType}</span>
                    {e.message && (
                      <span className="text-ink-secondary ml-2">{e.message}</span>
                    )}
                  </span>
                  <span className="text-ink-tertiary text-right">
                    {e.actorName ?? e.actorType}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          <Section eyebrow="Add" title="Note">
            <AddOrderNoteForm orderId={order.id} />
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section eyebrow="Lifecycle" title="Move forward">
            <OrderTransitionForm
              orderId={order.id}
              currentStatus={order.status as OrderStatus}
              currency={order.currency}
              pricingModel={service?.pricingModel ?? "fixed"}
            />
          </Section>

          <Section eyebrow="Finance" title="Bridge">
            <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-secondary">Status</span>
                <Badge
                  tone={
                    order.financeBridgeStatus === "bridged"
                      ? "success"
                      : order.financeBridgeStatus === "skipped_no_charge"
                        ? "neutral"
                        : order.financeBridgeStatus === "skipped_locked_period"
                          ? "warning"
                          : "info"
                  }
                >
                  {order.financeBridgeStatus}
                </Badge>
              </div>
              {financeLink && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-tertiary">Amount</span>
                    <span className="font-mono tabular-nums">
                      {formatMinorMoney(financeLink.amountMinor, financeLink.currency)}
                    </span>
                  </div>
                  {financeLink.reason && (
                    <p className="text-[11px] text-ink-tertiary border-t border-line-soft pt-2">
                      {financeLink.reason}
                    </p>
                  )}
                </>
              )}
              {order.linkedRevenueLineId && (
                <Link
                  href={`/dashboard/finance/revenue`}
                  className="text-xs text-ink hover:underline underline-offset-4"
                >
                  Open revenue ledger
                </Link>
              )}
              {order.status === "fulfilled" &&
                order.financeBridgeStatus !== "bridged" && (
                  <BridgeOrderForm orderId={order.id} />
                )}
            </div>
          </Section>

          <Section eyebrow="Fulfilment" title="Operational layer">
            {fulfilment ? (
              <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink">
                    {fulfilment.fulfilmentCode}
                  </span>
                  <Badge tone="neutral">{fulfilment.status}</Badge>
                </div>
                <Link
                  href={`/dashboard/service-fulfilment/fulfilments/${fulfilment.id}`}
                  className="text-xs text-ink hover:underline underline-offset-4"
                >
                  Open fulfilment →
                </Link>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-line-soft bg-muted/20 px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-tertiary">
                  No fulfilment yet — create one to dispatch a vendor.
                </span>
                <CreateFulfilmentForOrderButton orderId={order.id} />
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Pair({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </dt>
      <dd className="text-ink mt-1 font-mono tabular-nums">{children}</dd>
    </div>
  );
}
