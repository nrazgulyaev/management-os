import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listServiceVendors } from "@/features/service-fulfilment/services";
import { SettingsRowActions } from "@/components/dashboard/settings/settings-row-actions";
import { VendorAddButton } from "@/components/service-fulfilment/vendor-add-button";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Service vendors" };
export const dynamic = "force-dynamic";

export default async function VendorsListPage() {
  const vendors = await listServiceVendors();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Service fulfilment", href: "/dashboard/service-fulfilment" },
          { label: "Vendors" },
        ]}
        title="Service vendors"
        description="Vendor registry. Each vendor is mapped to one or more guest services they can fulfil."
        actions={<VendorAddButton />}
      />
      <Section eyebrow="Registry" title={`${vendors.length} vendors`}>
        {vendors.length === 0 ? (
          <NoItemsYet
            entityLabel="vendors"
            description="Register vendors so guest service orders route to them automatically."
            addHref="/dashboard/service-fulfilment/vendors/new"
            addLabel="New vendor"
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id} className="border-t border-line-soft">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/service-fulfilment/vendors/${v.id}`}
                        className="text-ink hover:underline underline-offset-4"
                      >
                        {v.displayName}
                      </Link>
                      <div className="text-[10px] font-mono text-ink-tertiary">
                        {v.vendorCode}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize">{v.vendorType}</td>
                    <td className="px-4 py-3 text-xs">{v.serviceArea ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {v.ratingAverage ?? "—"} ({v.ratingCount})
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          v.status === "active"
                            ? "success"
                            : v.status === "paused"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {v.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SettingsRowActions
                        kind="service_vendor"
                        row={{
                          id: v.id,
                          displayName: v.displayName,
                          detailHref: `/dashboard/service-fulfilment/vendors/${v.id}`,
                          values: {
                            vendorCode: v.vendorCode,
                            displayName: v.displayName,
                            legalName: v.legalName ?? "",
                            vendorType: v.vendorType,
                            contactName: v.contactName ?? "",
                            contactPhone: v.contactPhone ?? "",
                            contactEmail: v.contactEmail ?? "",
                            preferredChannel: v.preferredChannel ?? "",
                            serviceArea: v.serviceArea ?? "",
                            defaultCurrency: v.defaultCurrency,
                            internalNotes: v.internalNotes ?? "",
                          },
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
