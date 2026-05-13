import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { listOwnerStayPolicies } from "@/features/owner-stays/services";
import { OwnersRowActions } from "@/components/dashboard/owners/owners-row-actions";
import { AddOwnerStayPolicyButton } from "@/components/dashboard/owners/owners-add-buttons";
import { NoItemsYet, ListTableCard } from "@/components/ui/primitives";

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
        actions={<AddOwnerStayPolicyButton />}
      />

      <ListTableCard
        eyebrow="Catalog"
        title="Policies"
        count={policies.length}
        isEmpty={policies.length === 0}
        emptyState={
          <NoItemsYet
            entityLabel="policies"
            description="Create a policy so owner stays have a default — free nights, approval routing, compensation model."
            addAction={<AddOwnerStayPolicyButton />}
          />
        }
      >
        {policies.length === 0 ? null : (
          <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-right px-3 py-2">Free nights</th>
                  <th className="text-left px-3 py-2">Compensation</th>
                  <th className="text-left px-3 py-2">Op cost</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th />
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
                    <td className="px-3 py-2 text-right">
                      <OwnersRowActions
                        kind="policy"
                        row={{
                          id: p.id,
                          displayName: p.policyName,
                          values: {
                            policyName: p.policyName,
                            projectId: p.projectId ?? "",
                            villaId: p.villaId ?? "",
                            freeNightsPerYear: p.freeNightsPerYear,
                            freeNightsApplyToPeak: p.freeNightsApplyToPeak,
                            requiresApproval: p.requiresApproval,
                            allowDisplacingGuestBookings: p.allowDisplacingGuestBookings,
                            relocationAllowed: p.relocationAllowed,
                            operationalCostModel: p.operationalCostModel,
                            fixedOperationalCostMinor:
                              p.fixedOperationalCostMinor ?? "",
                            currency: p.currency ?? "",
                            compensationModel: p.compensationModel,
                            compensationPercent: p.compensationPercent ?? "",
                            fixedCompensationMinor: p.fixedCompensationMinor ?? "",
                          },
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </ListTableCard>
    </div>
  );
}
