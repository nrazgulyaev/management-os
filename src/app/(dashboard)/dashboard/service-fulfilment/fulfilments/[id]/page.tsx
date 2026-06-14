import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { getGuestServiceFulfilmentById } from "@/features/service-fulfilment/services";
import { requireOrgId } from "@/features/auth/require-org";
import {
  formatFulfilmentAmountForAdmin,
} from "@/features/service-fulfilment/pricing-pure";
import {
  guestFacingFulfilmentStatus,
  vendorFacingFulfilmentStatus,
  type FulfilmentStatus,
} from "@/features/service-fulfilment/status-pure";
import {
  BridgeFulfilmentButton,
  CancelFulfilmentButton,
  CompleteFulfilmentInline,
  EtaForm,
  IssueVendorTokenButton,
  RequestGuestConfirmationButton,
  ReverseBridgeButton,
  ScheduleForm,
  TransitionStatusButton,
} from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Fulfilment detail" };
export const dynamic = "force-dynamic";

export default async function FulfilmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getGuestServiceFulfilmentById(id, await requireOrgId());
  if (!detail) notFound();
  const { fulfilment: f, service, vendor, villa, events, invoices, ratings, financeLink } =
    detail;
  const guest = guestFacingFulfilmentStatus(f.status as FulfilmentStatus);
  const vendorView = vendorFacingFulfilmentStatus(f.status as FulfilmentStatus);

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/service-fulfilment">Service fulfilment</Link> /{" "}
            <Link href="/dashboard/service-fulfilment/fulfilments">Fulfilments</Link> /{" "}
            <span>{f.fulfilmentCode}</span>
          </div>
          <h1>{service?.name ?? "Fulfilment"}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`Order ${detail.order?.orderCode ?? "—"} · ${villa?.unitCode ?? "—"} · ${f.fulfilmentType}`}
          </p>
        </div>
        <div className="actions">
          <HandoffBadge tone="soft">{f.status}</HandoffBadge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div>
            <div className="label mb-2.5">Schedule</div>
            <Card padding="default">
              <div className="flex flex-col gap-4">
                <ScheduleForm fulfilmentId={f.id} />
                <EtaForm fulfilmentId={f.id} />
                <p className="text-xs text-ink-tertiary">
                  Scheduled: {f.scheduledFor?.toISOString() ?? "—"} ·
                  ETA: {f.etaAt?.toISOString() ?? "—"} ·
                  Started: {f.startedAt?.toISOString() ?? "—"} ·
                  Completed: {f.completedAt?.toISOString() ?? "—"}
                </p>
              </div>
            </Card>
          </div>

          <div>
            <div className="label mb-2.5">Pricing</div>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <Field
                label="Vendor quote"
                value={formatFulfilmentAmountForAdmin(f.vendorQuoteMinor, f.currency)}
                mono
              />
              <Field
                label="Internal cost"
                value={formatFulfilmentAmountForAdmin(f.internalCostMinor, f.currency)}
                mono
              />
              <Field
                label="Guest price"
                value={formatFulfilmentAmountForAdmin(f.guestPriceMinor, f.currency)}
                mono
              />
              <Field
                label="Margin"
                value={formatFulfilmentAmountForAdmin(f.marginMinor, f.currency)}
                mono
              />
            </dl>
            {f.status !== "completed" && (
              <div className="mt-4">
                <CompleteFulfilmentInline fulfilmentId={f.id} />
              </div>
            )}
          </div>

          <div>
            <div className="label mb-2.5">Timeline</div>
            {events.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
                No events yet.
              </p>
            ) : (
              <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                {events.map((e) => (
                  <li key={e.id} className="px-4 py-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink font-medium">
                        {e.title}
                      </span>
                      <span className="text-[11px] font-mono text-ink-tertiary">
                        {e.createdAt.toISOString()}
                      </span>
                    </div>
                    <span className="text-xs text-ink-tertiary capitalize">
                      {e.actorType} · {e.eventType}
                      {e.description ? ` — ${e.description}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="label mb-2.5">Invoices</div>
            {invoices.length === 0 ? (
              <p className="text-xs text-ink-tertiary">No vendor invoices attached.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="rounded-md border border-line-soft bg-surface px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm text-ink">
                        {inv.invoiceNumber ?? "(no number)"} ·
                        {" "}
                        {formatFulfilmentAmountForAdmin(inv.amountMinor, inv.currency)}
                      </span>
                      <span className="text-xs text-ink-tertiary">
                        {inv.invoiceStatus} · due {inv.dueDate ?? "—"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="label mb-2.5">Ratings</div>
            {ratings.length === 0 ? (
              <p className="text-xs text-ink-tertiary">Not yet rated.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ratings.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-line-soft bg-surface px-4 py-3"
                  >
                    <div className="text-sm text-ink">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)} ·
                      {" "}
                      {r.sentiment ?? "—"}
                    </div>
                    {r.comment && (
                      <p className="mt-1 text-xs text-ink-tertiary">
                        {r.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <div>
            <div className="label mb-2.5">Vendor</div>
            <Card padding="default">
              <div className="text-sm text-ink mb-1">{vendor?.displayName ?? "—"}</div>
              <div className="text-xs text-ink-tertiary">
                {vendor?.vendorType ?? "—"} · {vendor?.serviceArea ?? "—"}
              </div>
              <div className="mt-2 flex flex-col gap-2">
                <IssueVendorTokenButton fulfilmentId={f.id} />
                {f.requiresGuestConfirmation && !f.guestConfirmedAt && (
                  <RequestGuestConfirmationButton fulfilmentId={f.id} />
                )}
                <p className="text-[11px] text-ink-tertiary">
                  Vendor view: {vendorView.label}{" "}
                  {vendorView.awaitingVendor && "· awaiting vendor reply"}
                </p>
              </div>
            </Card>
          </div>

          <div>
            <div className="label mb-2.5">Status</div>
            <Card padding="default">
              <div className="flex flex-col gap-2">
                <TransitionStatusButton fulfilmentId={f.id} to="triage" label="Move to triage" />
                <TransitionStatusButton
                  fulfilmentId={f.id}
                  to="awaiting_vendor"
                  label="Move to awaiting vendor"
                />
                <TransitionStatusButton
                  fulfilmentId={f.id}
                  to="scheduled"
                  label="Move to scheduled"
                />
                <TransitionStatusButton
                  fulfilmentId={f.id}
                  to="in_progress"
                  label="Mark in progress"
                />
                <CancelFulfilmentButton fulfilmentId={f.id} />
              </div>
            </Card>
          </div>

          <div>
            <div className="label mb-2.5">Finance</div>
            <Card padding="default">
              {financeLink ? (
                <div className="flex flex-col gap-2">
                  <HandoffBadge tone={financeLink.status === "bridged" ? "ok" : "soft"}>
                    {financeLink.status}
                  </HandoffBadge>
                  <span className="text-[11px] font-mono text-ink-tertiary">
                    Revenue: {financeLink.revenueLineId ?? "—"}
                  </span>
                  <span className="text-[11px] font-mono text-ink-tertiary">
                    Expense: {financeLink.expenseLineId ?? "—"}
                  </span>
                  {financeLink.errorMessage && (
                    <span className="text-[11px] text-danger">
                      {financeLink.errorMessage}
                    </span>
                  )}
                  {financeLink.status === "bridged" && (
                    <ReverseBridgeButton fulfilmentId={f.id} />
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-tertiary">Not yet bridged.</p>
              )}
              {f.status === "completed" &&
                (!financeLink || financeLink.status !== "bridged") && (
                  <div className="mt-3">
                    <BridgeFulfilmentButton fulfilmentId={f.id} />
                  </div>
                )}
            </Card>
          </div>

          <div>
            <div className="label mb-2.5">Guest</div>
            <div className="rounded-md border border-line-soft bg-canvas p-4">
              <div className="text-sm text-ink">{guest.label}</div>
              {f.scheduledFor && (
                <div className="text-xs text-ink-tertiary mt-1">
                  Scheduled {f.scheduledFor.toISOString()}
                </div>
              )}
              {f.etaAt && (
                <div className="text-xs text-ink-tertiary mt-1">
                  ETA {f.etaAt.toISOString()}
                </div>
              )}
              <p className="mt-2 text-[11px] text-ink-tertiary">
                Guests never see the vendor name, internal status, vendor
                quote, internal cost, or margin.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
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
      <dd className={`mt-1 text-ink ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </dd>
    </div>
  );
}
