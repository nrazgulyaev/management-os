import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  getServiceVendorById,
  listGuestServiceFulfilments,
  listGuestServiceRatings,
  listVendorInvoices,
  listVendorServices,
} from "@/features/service-fulfilment/services";
import {
  formatFulfilmentAmountForAdmin,
} from "@/features/service-fulfilment/pricing-pure";
import { VendorStatusButton } from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Vendor detail" };
export const dynamic = "force-dynamic";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vendor = await getServiceVendorById(id);
  if (!vendor) notFound();
  const [services, fulfilments, invoices, ratings] = await Promise.all([
    listVendorServices(id),
    listGuestServiceFulfilments({ vendorId: id, limit: 20 }),
    listVendorInvoices({ vendorId: id, limit: 20 }),
    listGuestServiceRatings({ vendorId: id, limit: 20 }),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/service-fulfilment">Service fulfilment</Link> /{" "}
            <Link href="/dashboard/service-fulfilment/vendors">Vendors</Link> /{" "}
            <span>{vendor.displayName}</span>
          </div>
          <h1>{vendor.displayName}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {vendor.vendorType} · {vendor.serviceArea ?? "—"}
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-3">
            <HandoffBadge
              tone={
                vendor.status === "active"
                  ? "ok"
                  : vendor.status === "paused"
                    ? "warn"
                    : "soft"
              }
            >
              {vendor.status}
            </HandoffBadge>
            {vendor.status !== "paused" && (
              <VendorStatusButton id={vendor.id} action="pause" />
            )}
            {vendor.status !== "archived" && (
              <VendorStatusButton id={vendor.id} action="archive" />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div>
            <div className="label mb-2.5">Catalogue</div>
            {services.length === 0 ? (
              <p className="text-xs text-ink-tertiary">
                No services mapped yet.
              </p>
            ) : (
              <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                {services.map(({ link, service }) => (
                  <li
                    key={link.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm text-ink">{service?.name ?? "—"}</span>
                      <span className="text-[11px] text-ink-tertiary">
                        Lead time: {link.leadTimeMinutes ?? "—"}m · base cost:
                        {" "}
                        {formatFulfilmentAmountForAdmin(link.baseCostMinor, link.currency)}
                      </span>
                    </div>
                    <HandoffBadge tone={link.status === "active" ? "ok" : "soft"}>
                      {link.status}
                    </HandoffBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="label mb-2.5">Recent fulfilments</div>
            <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
              {fulfilments.map(({ fulfilment: f, service }) => (
                <li key={f.id} className="px-4 py-3 flex items-center justify-between">
                  <Link
                    href={`/dashboard/service-fulfilment/fulfilments/${f.id}`}
                    className="text-sm text-ink hover:underline"
                  >
                    {f.fulfilmentCode} · {service?.name ?? "—"}
                  </Link>
                  <HandoffBadge tone="soft">{f.status}</HandoffBadge>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="label mb-2.5">Recent invoices</div>
            {invoices.length === 0 ? (
              <p className="text-xs text-ink-tertiary">No invoices yet.</p>
            ) : (
              <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                {invoices.map(({ invoice }) => (
                  <li key={invoice.id} className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-ink">
                      {invoice.invoiceNumber ?? "(no number)"} ·
                      {" "}
                      {formatFulfilmentAmountForAdmin(invoice.amountMinor, invoice.currency)}
                    </span>
                    <HandoffBadge tone="soft">{invoice.invoiceStatus}</HandoffBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <div>
            <div className="label mb-2.5">Ratings</div>
            <Card padding="default">
              <div className="text-2xl text-ink font-medium">
                {vendor.ratingAverage ?? "—"}
              </div>
              <div className="text-xs text-ink-tertiary">
                {vendor.ratingCount} rating{vendor.ratingCount === 1 ? "" : "s"}
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {ratings.slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-line-soft bg-canvas px-3 py-2 text-xs"
                  >
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                    {r.comment && (
                      <p className="mt-1 text-ink-tertiary">{r.comment}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div>
            <div className="label mb-2.5">Contact</div>
            <Card padding="default">
              <dl className="text-xs text-ink-tertiary flex flex-col gap-1">
                <div>
                  <dt className="inline text-ink">Contact:</dt> {vendor.contactName ?? "—"}
                </div>
                <div>
                  <dt className="inline text-ink">Phone:</dt> {vendor.contactPhone ?? "—"}
                </div>
                <div>
                  <dt className="inline text-ink">Email:</dt> {vendor.contactEmail ?? "—"}
                </div>
                <div>
                  <dt className="inline text-ink">Channel:</dt> {vendor.preferredChannel ?? "—"}
                </div>
              </dl>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}
