import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { listGuestStayTokens } from "@/features/guest-stays/services";

export const metadata = { title: "Guest stays" };
export const dynamic = "force-dynamic";

export default async function GuestStaysHub() {
  const [active, revoked] = await Promise.all([
    listGuestStayTokens({ status: "active", limit: 200 }),
    listGuestStayTokens({ status: "revoked", limit: 200 }),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Guest stays" }]}
        title="Guest stays"
        description="Issue signed stay tokens, edit the villa guide, manage the smart-lock stub. The guest portal at /stay/[token] reads through these primitives — no raw booking IDs are ever in public URLs."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active tokens" value={String(active.length)} />
        <MetricCard label="Revoked" value={String(revoked.length)} />
      </div>
      <Section eyebrow="Surfaces" title="Jump to">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card href="/dashboard/guest-stays/tokens" title="Tokens" detail={`${active.length} active`} />
          <Card href="/dashboard/villa-guides/sections" title="Guide sections" detail="Check-in, house rules, amenities, transport, …" />
          <Card href="/dashboard/villa-guides/wifi" title="Wi-Fi" detail="Per-villa or per-project network credentials" />
          <Card href="/dashboard/villa-guides/emergency-contacts" title="Emergency contacts" detail="Safety + concierge contacts" />
          <Card href="/dashboard/villa-guides/neighborhood" title="Neighborhood" detail="Restaurants, beaches, transport" />
          <Card href="/dashboard/guest-services" title="Guest services" detail="Catalog, orders, finance bridge" />
        </div>
      </Section>
    </div>
  );
}

function Card({ href, title, detail }: { href: string; title: string; detail: string }) {
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
