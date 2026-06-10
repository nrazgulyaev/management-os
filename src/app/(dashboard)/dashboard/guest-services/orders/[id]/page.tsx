import Link from "next/link";
import { notFound } from "next/navigation";
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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-services">Guest services</Link> /{" "}
            <Link href="/dashboard/guest-services/orders">Orders</Link> /{" "}
            <span>{order.orderCode}</span>
          </div>
          <h1>{service?.name ?? "Service order"}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            {order.orderCode} · {detail.villaCode ?? "—"} ·{" "}
            {detail.bookingCode ?? "no booking"}
          </p>
        </div>
        <div className="actions">
          <Badge tone={toneForStatus(order.status as OrderStatus)}>
            {ORDER_STATUS_LABELS[order.status as OrderStatus]}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[18px]">
        <div className="lg:col-span-2 flex flex-col gap-[18px]">
          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Request details
            </h2>
            <dl className="card px-5 py-[18px] grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <Pair label="Service">
                {service?.name ?? "—"}
                <div className="text-[11px] text-ink-4 mt-0.5">
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
                  <span className="block text-ink-2 whitespace-pre-wrap">
                    {order.guestNote}
                  </span>
                </Pair>
              )}
              {order.internalNote && (
                <Pair label="Internal note" className="md:col-span-3">
                  <span className="block text-ink-2 whitespace-pre-wrap">
                    {order.internalNote}
                  </span>
                </Pair>
              )}
            </dl>
          </div>

          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">Timeline</h2>
            <ol className="card p-0 overflow-hidden divide-y divide-[var(--line-soft,var(--line))]">
              {events.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-4">
                  No events yet.
                </li>
              )}
              {events.map((e) => (
                <li
                  key={e.id}
                  className="px-4 py-3 grid grid-cols-[120px_1fr_140px] gap-4 text-xs"
                >
                  <span className="mono text-ink-4">
                    {new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                  <span>
                    <span className="font-medium">{e.eventType}</span>
                    {e.message && (
                      <span className="text-ink-3 ml-2">{e.message}</span>
                    )}
                  </span>
                  <span className="text-ink-4 text-right">
                    {e.actorName ?? e.actorType}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">Add note</h2>
            <div className="card px-5 py-[18px]">
              <AddOrderNoteForm orderId={order.id} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[18px]">
          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Lifecycle
            </h2>
            <div className="card px-5 py-[18px]">
              <OrderTransitionForm
                orderId={order.id}
                currentStatus={order.status as OrderStatus}
                currency={order.currency}
                pricingModel={service?.pricingModel ?? "fixed"}
              />
            </div>
          </div>

          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Finance bridge
            </h2>
            <div className="card px-5 py-[18px] flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Status</span>
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
                    <span className="text-ink-4">Amount</span>
                    <span className="mono tabular-nums">
                      {formatMinorMoney(financeLink.amountMinor, financeLink.currency)}
                    </span>
                  </div>
                  {financeLink.reason && (
                    <p className="text-[11px] text-ink-4 border-t border-[var(--line-soft,var(--line))] pt-2">
                      {financeLink.reason}
                    </p>
                  )}
                </>
              )}
              {order.linkedRevenueLineId && (
                <Link
                  href={`/dashboard/finance/revenue`}
                  className="text-xs hover:text-terra underline underline-offset-4"
                >
                  Open revenue ledger
                </Link>
              )}
              {order.status === "fulfilled" &&
                order.financeBridgeStatus !== "bridged" && (
                  <BridgeOrderForm orderId={order.id} />
                )}
            </div>
          </div>

          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Fulfilment
            </h2>
            {fulfilment ? (
              <div className="card px-5 py-[18px] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="mono text-xs">
                    {fulfilment.fulfilmentCode}
                  </span>
                  <Badge tone="neutral">{fulfilment.status}</Badge>
                </div>
                <Link
                  href={`/dashboard/service-fulfilment/fulfilments/${fulfilment.id}`}
                  className="text-xs hover:text-terra underline underline-offset-4"
                >
                  Open fulfilment →
                </Link>
              </div>
            ) : (
              <div className="card px-5 py-[18px] flex items-center justify-between gap-3">
                <span className="text-xs text-ink-4">
                  No fulfilment yet — create one to dispatch a vendor.
                </span>
                <CreateFulfilmentForOrderButton orderId={order.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
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
      <dt className="mono text-[10px] uppercase tracking-[0.16em] text-ink-4">
        {label}
      </dt>
      <dd className="mt-1 mono tabular-nums text-[13px]">{children}</dd>
    </div>
  );
}
