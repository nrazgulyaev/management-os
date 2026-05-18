import Link from "next/link";
import { SectionHeading } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listOwners } from "@/features/owners/services";
import { OwnersRowActions } from "@/components/dashboard/owners/owners-row-actions";
import { OwnerAddButton } from "@/components/owners/owner-add-button";
import { ListTableCard, NoItemsYet } from "@/components/ui/primitives";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { startImpersonatingOwner } from "@/features/owner-portal/impersonation-actions";

export const metadata = { title: "Owners & investors" };
export const dynamic = "force-dynamic";

const statusTone: Record<string, "success" | "gold" | "neutral"> = {
  active: "success",
  onboarding: "gold",
  archived: "neutral",
};

async function viewAsOwnerAction(formData: FormData) {
  "use server";
  const ownerId = (formData.get("ownerId") as string) ?? "";
  if (!ownerId) return;
  await startImpersonatingOwner(ownerId);
}

export default async function OwnersPage() {
  const [owners, ctx] = await Promise.all([listOwners(), getCurrentUserContext()]);
  const source = owners[0]?.source ?? "mock";
  const canImpersonate = ctx.isSuperAdmin;

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Portfolio · owners & investors"
        title="Owners & investors"
        subtitle="Individuals, companies, and family offices participating across the portfolio."
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
            <OwnerAddButton />
          </div>
        }
      />

      <DbStatusNotice />

      {owners.length === 0 ? (
        <NoItemsYet
          entityLabel="owners"
          description="Add the individuals, companies, and family offices participating in your portfolio."
          addHref="/dashboard/owners/new"
          addLabel="New owner"
        />
      ) : (
        <ListTableCard
          eyebrow="Stakeholders"
          title="All owners & investors"
          count={owners.length}
        >
        <Table>
          <THead>
            <TR>
              <TH>Owner</TH>
              <TH>Type</TH>
              <TH>Nationality</TH>
              <TH>Email</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {owners.map((o) => (
              <TR key={o.id}>
                <TD>
                  <Link
                    href={`/dashboard/owners/${o.id}`}
                    className="text-ink font-medium hover:text-accent"
                  >
                    {o.displayName}
                  </Link>
                  {o.legalName && o.legalName !== o.displayName && (
                    <div className="text-xs text-ink-tertiary mt-0.5">
                      {o.legalName}
                    </div>
                  )}
                </TD>
                <TD>
                  <Badge tone="outline">{o.type.replace("_", " ")}</Badge>
                </TD>
                <TD className="text-ink-secondary">{o.nationality ?? "—"}</TD>
                <TD className="text-ink-secondary text-sm">{o.email ?? "—"}</TD>
                <TD>
                  <Badge tone={statusTone[o.status] ?? "neutral"}>
                    {o.status}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canImpersonate && (
                      <form action={viewAsOwnerAction}>
                        <input type="hidden" name="ownerId" value={o.id} />
                        <button
                          type="submit"
                          className="text-xs text-ink-secondary hover:text-terra px-2 py-1 border border-line-soft rounded transition-colors"
                          title="Open this owner's portal view"
                        >
                          View as owner →
                        </button>
                      </form>
                    )}
                    <OwnersRowActions
                      kind="owner"
                      row={{
                        id: o.id,
                        displayName: o.displayName,
                        detailHref: `/dashboard/owners/${o.id}`,
                        values: {
                          type: o.type,
                          displayName: o.displayName,
                          legalName: o.legalName ?? "",
                          email: o.email ?? "",
                          phone: o.phone ?? "",
                          nationality: o.nationality ?? "",
                          taxResidency: o.taxResidency ?? "",
                          status: o.status,
                        },
                      }}
                    />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        </ListTableCard>
      )}
    </div>
  );
}
