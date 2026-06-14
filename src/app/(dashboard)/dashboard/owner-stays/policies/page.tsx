import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-stays">Owner stays</Link> /{" "}
            <span>Policies</span>
          </div>
          <h1>Owner stay policies</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-villa or per-project rules: free nights, blackout, approval,
            compensation model, operational cost.
          </p>
        </div>
        <div className="actions">
          <AddOwnerStayPolicyButton />
        </div>
      </div>

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
          <table className="data">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Scope</th>
                  <th scope="col" className="num">Free nights</th>
                  <th scope="col">Compensation</th>
                  <th scope="col">Op cost</th>
                  <th scope="col">Status</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td className="row-title">{p.policyName}</td>
                    <td>
                      {p.villaCode ? `villa ${p.villaCode}` : p.projectName ? `project ${p.projectName}` : "global"}
                    </td>
                    <td className="num">
                      {p.freeNightsPerYear}
                      {p.freeNightsApplyToPeak && (
                        <span className="text-ink-3"> +peak</span>
                      )}
                    </td>
                    <td className="text-ink-3 text-xs">
                      {p.compensationModel.replace(/_/g, " ")}
                      {p.compensationPercent ? ` · ${p.compensationPercent}%` : ""}
                    </td>
                    <td className="text-ink-3 text-xs">
                      {p.operationalCostModel.replace(/_/g, " ")}
                    </td>
                    <td>
                      <HandoffBadge tone={p.status === "active" ? "ok" : "soft"}>
                        {p.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
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
