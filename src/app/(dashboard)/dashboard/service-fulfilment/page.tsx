import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Card, Kpi, SectionHeading } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  getFulfilmentMetrics,
  listGuestServiceFulfilments,
  listServiceVendors,
} from "@/features/service-fulfilment/services";
import { formatFulfilmentAmountForAdmin } from "@/features/service-fulfilment/pricing-pure";
import { BridgePendingButton } from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Service fulfilment" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "accent" | "warning" | "success" | "info" | "neutral" | "danger"
> = {
  new: "accent",
  triage: "accent",
  awaiting_vendor: "warning",
  vendor_confirmed: "info",
  guest_confirmed: "info",
  scheduled: "success",
  in_progress: "info",
  completed: "neutral",
  cancelled: "neutral",
  failed: "danger",
  no_show: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  triage: "Triage",
  awaiting_vendor: "Awaiting vendor",
  vendor_confirmed: "Vendor confirmed",
  guest_confirmed: "Guest confirmed",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
  no_show: "No-show",
};

function fmtEta(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function ServiceFulfilmentHub() {
  const [m, vendors, queue] = await Promise.all([
    getFulfilmentMetrics(),
    listServiceVendors({ status: "active" }),
    listGuestServiceFulfilments({ limit: 14 }),
  ]);

  const rated = vendors.filter((v) => v.ratingAverage != null);
  const avgRating =
    rated.length > 0
      ? (
          rated.reduce((s, v) => s + Number(v.ratingAverage), 0) / rated.length
        ).toFixed(1)
      : "—";
  const awaiting = m.awaitingVendorCount;
  const triage = m.newCount + m.triageCount;

  return (
    <>
      <SectionHeading
        eyebrow="Service fulfilment · vendor dispatch"
        title={
          <>
            Request to <em>margin</em>.
          </>
        }
        subtitle="Triage guest requests, dispatch vendors, track ETAs, capture invoices + ratings, bridge to finance — without leaking guest contact or owner finance to vendors."
        actions={<BridgePendingButton />}
      />

      <div className="dist-kpis">
        <Kpi
          label="Triage"
          value={String(triage)}
          sub="need routing"
          tone={triage > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Awaiting vendor"
          value={String(awaiting)}
          sub={`${m.unbridgedCompletedCount} unbridged`}
          tone={awaiting > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Scheduled today"
          value={String(m.scheduledTodayCount)}
          sub="dispatched"
        />
        <Kpi
          label="Margin · completed"
          value={formatFulfilmentAmountForAdmin(m.totalMarginMinor, m.marginCurrency)}
          sub={`avg rating ${avgRating}`}
          tone="gold"
        />
      </div>

      {/* Triage queue */}
      <Card padding="none" overflowHidden className="mb-[18px]">
        <div className="dist-card-h px-5 pt-[18px]">
          <h3>Triage queue</h3>
          <span className="meta">{queue.length} open · newest first</span>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Request</th>
              <th scope="col">Guest · villa</th>
              <th scope="col">Vendor</th>
              <th scope="col">ETA</th>
              <th scope="col" className="num">Margin</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <TableEmpty colSpan={6}>No open fulfilments. Guest service orders land here for triage.</TableEmpty>
            ) : (
              queue.map(({ fulfilment: f, service, vendor, villa }) => (
                <tr key={f.id}>
                  <td className="row-title">
                    <Link
                      href={`/dashboard/service-fulfilment/fulfilments/${f.id}`}
                      className="hover:text-terra"
                    >
                      {service?.name ?? f.fulfilmentCode}
                    </Link>
                  </td>
                  <td className="mono text-[12px]">{villa?.unitCode ?? "—"}</td>
                  <td className={vendor ? "" : "text-ink-4"}>
                    {vendor?.displayName ?? "—"}
                  </td>
                  <td className="mono text-[12px] text-ink-3">
                    {fmtEta(f.scheduledFor)}
                  </td>
                  <td className="num mono text-[12px]">
                    {f.marginMinor != null
                      ? formatFulfilmentAmountForAdmin(f.marginMinor, f.currency)
                      : "—"}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[f.status] ?? "neutral"}>
                      {STATUS_LABEL[f.status] ?? f.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Vendor scorecards */}
      <div className="flex items-end justify-between mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          Vendor scorecards · <em>{vendors.length}</em>
        </h2>
        <Link
          href="/dashboard/service-fulfilment/vendors"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All vendors →
        </Link>
      </div>
      <Card padding="none" overflowHidden className="mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Vendor</th>
              <th scope="col">Category</th>
              <th scope="col" className="num">Rating</th>
              <th scope="col" className="num">Ratings</th>
              <th scope="col">Channel</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <TableEmpty colSpan={6}>No vendors yet. Add one to start routing service orders.</TableEmpty>
            ) : (
              vendors.slice(0, 14).map((v) => (
                <tr key={v.id}>
                  <td className="row-title">
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
      </Card>

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
