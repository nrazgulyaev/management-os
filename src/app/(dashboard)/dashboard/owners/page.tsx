import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Plus } from "lucide-react";
import { listOwners } from "@/features/owners/services";

export const metadata = { title: "Owners & investors" };

const statusTone: Record<string, "success" | "gold" | "neutral"> = {
  active: "success",
  onboarding: "gold",
  archived: "neutral",
};

export default async function OwnersPage() {
  const owners = await listOwners();
  const source = owners[0]?.source ?? "mock";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/dashboard" },
          { label: "Owners & investors" },
        ]}
        title="Owners & investors"
        description="Individuals, companies, and family offices participating across the portfolio."
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
            <Button asChild>
              <Link href="/dashboard/owners/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New owner
              </Link>
            </Button>
          </div>
        }
      />

      <DbStatusNotice />

      <Table>
        <THead>
          <TR>
            <TH>Owner</TH>
            <TH>Type</TH>
            <TH>Nationality</TH>
            <TH>Email</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {owners.length === 0 ? (
            <TR>
              <TD colSpan={5} className="text-ink-tertiary text-center py-8">
                No owners yet.
              </TD>
            </TR>
          ) : (
            owners.map((o) => (
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
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
