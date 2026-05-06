import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import {
  getOrderStats,
  listAllCatalogServices,
  listCategories,
} from "@/features/guest-services/services";
import { formatMinorMoney } from "@/features/guest-services/pricing";

export const metadata = { title: "Guest services" };
export const dynamic = "force-dynamic";

export default async function GuestServicesHub() {
  const [stats, categories, services] = await Promise.all([
    getOrderStats(),
    listCategories(),
    listAllCatalogServices({ limit: 200 }),
  ]);
  const activeServices = services.filter((s) => s.status === "active").length;
  const pausedServices = services.filter((s) => s.status === "paused").length;
  const archivedServices = services.filter((s) => s.status === "archived")
    .length;
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Guest services" }]}
        title="Guest services"
        description="Curate the upsell catalog, review concierge orders coming in from /stay/[token]/services, and bridge fulfilled orders into the revenue ledger."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Categories" value={String(categories.length)} />
        <MetricCard
          label="Catalog (active)"
          value={`${activeServices}`}
          hint={
            pausedServices + archivedServices > 0
              ? `${pausedServices} paused · ${archivedServices} archived`
              : undefined
          }
        />
        <MetricCard
          label="Live orders"
          value={String(stats.active)}
          hint={`${stats.fulfilled} fulfilled · ${stats.cancelled} cancelled`}
        />
        <MetricCard
          label="Bridged revenue"
          value={
            stats.currency
              ? formatMinorMoney(stats.bridgedRevenueMinor, stats.currency)
              : "—"
          }
          hint={
            stats.pendingFinanceBridge > 0
              ? `${stats.pendingFinanceBridge} pending bridge`
              : undefined
          }
        />
      </div>
      <Section eyebrow="Manage" title="Jump to">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card
            href="/dashboard/guest-services/catalog"
            title="Catalog"
            detail={`${services.length} services across ${categories.length} categories`}
          />
          <Card
            href="/dashboard/guest-services/categories"
            title="Categories"
            detail="Top-level grouping shown to guests"
          />
          <Card
            href="/dashboard/guest-services/orders"
            title="Orders"
            detail={`${stats.total} total · ${stats.active} live`}
          />
          <Card
            href="/dashboard/guest-services/finance-bridge"
            title="Finance bridge"
            detail={
              stats.pendingFinanceBridge > 0
                ? `${stats.pendingFinanceBridge} fulfilled orders need bridging`
                : "All fulfilled orders are bridged"
            }
          />
        </div>
      </Section>
    </div>
  );
}

function Card({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-line-soft bg-surface p-5 hover:border-line-strong transition-colors block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
