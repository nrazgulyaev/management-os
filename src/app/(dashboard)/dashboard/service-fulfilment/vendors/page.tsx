import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listServiceVendors } from "@/features/service-fulfilment/services";

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
        actions={
          <Link
            href="/dashboard/service-fulfilment/vendors/new"
            className="h-9 px-4 inline-flex items-center rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
          >
            New vendor
          </Link>
        }
      />
      <Section eyebrow="Registry" title={`${vendors.length} vendors`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No vendors registered yet.
                  </td>
                </tr>
              )}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
