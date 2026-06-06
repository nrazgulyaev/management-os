import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  getFulfilmentMetrics,
  listServiceVendors,
} from "@/features/service-fulfilment/services";
import { formatFulfilmentAmountForAdmin } from "@/features/service-fulfilment/pricing-pure";
import { BridgePendingButton } from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Service fulfilment" };
export const dynamic = "force-dynamic";

export default async function ServiceFulfilmentHub() {
  const [m, vendors] = await Promise.all([
    getFulfilmentMetrics(),
    listServiceVendors({ status: "active" }),
  ]);

  const inProgress = m.newCount + m.triageCount + m.awaitingVendorCount;
  const categories = new Set(vendors.map((v) => v.vendorType)).size;
  const rated = vendors.filter((v) => v.ratingAverage != null);
  const avgRating =
    rated.length > 0
      ? (
          rated.reduce((s, v) => s + Number(v.ratingAverage), 0) / rated.length
        ).toFixed(1)
      : "—";

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Service fulfilment</span>
          </div>
          <h1>Service fulfilment</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Every service tracked from guest order to vendor invoice to the
            finance bridge — without leaking guest contact info or owner finance
            to vendors. Scorecards drive routing.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/service-fulfilment/invoices" className="btn btn-secondary btn-sm">
            Invoices →
          </Link>
          <Link href="/dashboard/service-fulfilment/vendors" className="btn btn-accent btn-sm">
            Vendors →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Active vendors" value={String(vendors.length)} sub={`${categories} categories`} />
        <Kpi
          label="In progress"
          value={String(inProgress)}
          sub="new / triage / awaiting"
          tone={inProgress > 0 ? "accent" : undefined}
        />
        <Kpi label="Scheduled today" value={String(m.scheduledTodayCount)} sub="dispatched" />
        <Kpi
          label="Unbridged completed"
          value={String(m.unbridgedCompletedCount)}
          sub={m.unbridgedCompletedCount > 0 ? "bridge to finance" : "all bridged"}
          tone={m.unbridgedCompletedCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Margin · completed"
          value={formatFulfilmentAmountForAdmin(m.totalMarginMinor, m.marginCurrency)}
          sub={`avg rating ${avgRating}`}
          tone="gold"
        />
      </div>

      {/* Operate */}
      <div className="rounded-md border border-line-soft bg-surface px-4 py-3 flex items-center gap-3 flex-wrap text-xs mt-[18px]">
        <span className="text-ink-tertiary">
          Bridge completed fulfilments to revenue + expense lines
        </span>
        <div className="ml-auto">
          <BridgePendingButton />
        </div>
      </div>

      {/* Vendor scorecards */}
      <div className="flex items-end justify-between mt-6 mb-3.5">
        <h2 className="display text-[22px] font-normal">Vendor scorecards</h2>
        <Link
          href="/dashboard/service-fulfilment/vendors"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All vendors →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Category</th>
              <th className="num">Rating</th>
              <th className="num">Ratings</th>
              <th>Channel</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-3 italic py-8">
                  No vendors yet. Add one to start routing service orders.
                </td>
              </tr>
            ) : (
              vendors.slice(0, 14).map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link
                      href={`/dashboard/service-fulfilment/vendors/${v.id}`}
                      className="hover:text-terra"
                    >
                      {v.displayName}
                    </Link>
                  </td>
                  <td>
                    <Badge tone="outline">{v.vendorType}</Badge>
                  </td>
                  <td className="num mono text-[12px]">
                    {v.ratingAverage != null ? Number(v.ratingAverage).toFixed(1) : "—"}
                  </td>
                  <td className="num mono text-[12px]">{v.ratingCount}</td>
                  <td className="text-[12px] text-ink-3">{v.preferredChannel ?? "—"}</td>
                  <td>
                    <Badge tone={v.status === "active" ? "success" : "neutral"}>{v.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Surfaces */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
        {[
          { href: "/dashboard/service-fulfilment/fulfilments", title: "Fulfilments", detail: "Triage / ETA / completion" },
          { href: "/dashboard/service-fulfilment/invoices", title: "Invoices", detail: "Vendor invoice tracking" },
          { href: "/dashboard/service-fulfilment/ratings", title: "Ratings", detail: "Post-fulfilment guest ratings" },
          { href: "/dashboard/service-fulfilment/finance-bridge", title: "Finance bridge", detail: "Revenue + expense lines" },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-4 block hover:border-line-strong transition-colors"
          >
            <div className="text-ink font-medium text-[14px]">{c.title}</div>
            <div className="text-[12px] text-ink-3 mt-1">{c.detail}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
