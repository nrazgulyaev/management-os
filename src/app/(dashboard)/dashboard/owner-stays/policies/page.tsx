import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listOwnerStayPolicies } from "@/features/owner-stays/services";

export const metadata = { title: "Owner stay policies" };
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const policies = await listOwnerStayPolicies();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner stays", href: "/dashboard/owner-stays" },
          { label: "Policies" },
        ]}
        title="Owner stay policies"
        description="Per-villa or per-project rules: free nights, blackout, approval, compensation model, operational cost."
        actions={
          <Link
            href="/dashboard/owner-stays/policies/new"
            className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
          >
            + New policy
          </Link>
        }
      />

      <Section eyebrow="Catalog" title={`${policies.length} policies`}>
        {policies.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No policies yet — create one so owner stays have a default.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-right px-3 py-2">Free nights</th>
                  <th className="text-left px-3 py-2">Compensation</th>
                  <th className="text-left px-3 py-2">Op cost</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-ink font-medium">{p.policyName}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {p.villaCode ? `villa ${p.villaCode}` : p.projectName ? `project ${p.projectName}` : "global"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.freeNightsPerYear}
                      {p.freeNightsApplyToPeak && (
                        <span className="text-ink-tertiary"> +peak</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {p.compensationModel.replace(/_/g, " ")}
                      {p.compensationPercent ? ` · ${p.compensationPercent}%` : ""}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {p.operationalCostModel.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={p.status === "active" ? "success" : "neutral"}>
                        {p.status}
                      </Badge>
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
