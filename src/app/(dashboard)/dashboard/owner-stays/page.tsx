import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { listOwnerStayRequests, listOwnerStayPolicies, listEquivalenceGroups } from "@/features/owner-stays/services";

export const metadata = { title: "Owner stays" };
export const dynamic = "force-dynamic";

export default async function OwnerStaysOverview() {
  const [pending, requiresRelocation, approved, policies, groups] = await Promise.all([
    listOwnerStayRequests({ status: "pending_admin_approval", limit: 50 }),
    listOwnerStayRequests({ status: "requires_relocation", limit: 50 }),
    listOwnerStayRequests({ status: "approved", limit: 50 }),
    listOwnerStayPolicies({ status: "active" }),
    listEquivalenceGroups(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Owner stays" }]}
        title="Owner stays"
        description="Owner-portal requests + admin approval. Approved stays materialise as owner_stay calendar blocks. Owner stays do not count as rental revenue."
        actions={
          <Link
            href="/dashboard/owner-stays/requests"
            className="text-sm px-4 py-2 rounded-full border border-line-soft hover:border-line-strong"
          >
            All requests
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Pending approval" value={String(pending.length)} accent={pending.length > 0} />
        <MetricCard label="Requires relocation" value={String(requiresRelocation.length)} accent={requiresRelocation.length > 0} />
        <MetricCard label="Approved (active)" value={String(approved.length)} />
        <MetricCard label="Active policies" value={String(policies.length)} />
      </div>

      <Section eyebrow="Surfaces" title="Jump to">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card href="/dashboard/owner-stays/requests" title="Requests" detail={`${pending.length + requiresRelocation.length} need attention`} />
          <Card href="/dashboard/owner-stays/policies" title="Policies" detail={`${policies.length} active`} />
          <Card href="/dashboard/owner-stays/equivalence-groups" title="Equivalence groups" detail={`${groups.length} groups`} />
          <Card href="/dashboard/bookings/rates" title="Rate plans" detail="Used by owner-stay estimator + future direct booking" />
        </div>
      </Section>
    </div>
  );
}

function Card({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card hover:shadow-elevated-card hover:border-line-strong transition-all block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
