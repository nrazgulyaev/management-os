import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Plus, Filter } from "lucide-react";
import { listVillas } from "@/features/villas/services";

export const metadata = { title: "Villas" };

export default async function VillasPage() {
  const villas = await listVillas();
  const source = villas[0]?.source ?? "mock";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/dashboard" },
          { label: "Villas" },
        ]}
        title="Villas"
        description="Every villa under Arconique management. Status mirrors the operations board."
        actions={
          <div className="flex gap-2 items-center">
            <SourceBadge source={source} />
            <Button variant="secondary">
              <Filter className="w-4 h-4" strokeWidth={1.75} />
              Filter
            </Button>
            <Button asChild>
              <Link href="/dashboard/villas/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                Add villa
              </Link>
            </Button>
          </div>
        }
      />

      <DbStatusNotice />

      <Table>
        <THead>
          <TR>
            <TH>Villa</TH>
            <TH>Project</TH>
            <TH>Status</TH>
            <TH>Model</TH>
            <TH className="text-right">Bedrooms</TH>
            <TH className="text-right">Nightly · USD</TH>
            <TH>Owner-visible</TH>
          </TR>
        </THead>
        <TBody>
          {villas.length === 0 ? (
            <TR>
              <TD colSpan={7} className="text-ink-tertiary text-center py-8">
                No villas yet.
              </TD>
            </TR>
          ) : (
            villas.map((v) => (
              <TR key={v.id}>
                <TD>
                  <Link
                    href={`/dashboard/villas/${v.id}`}
                    className="flex flex-col gap-0.5 hover:text-accent transition-colors"
                  >
                    <span className="text-ink font-medium">{v.name ?? v.unitCode}</span>
                    <span className="text-xs text-ink-tertiary font-mono tabular-nums">
                      {v.unitCode}
                    </span>
                  </Link>
                </TD>
                <TD className="text-ink-secondary">{v.projectName}</TD>
                <TD>
                  <StatusPill status={v.status} />
                </TD>
                <TD>
                  <Badge tone="outline">{v.managementModel}</Badge>
                </TD>
                <TDNum>{v.bedrooms}</TDNum>
                <TDNum>
                  {v.currentNightlyRateUsd !== null
                    ? `$${v.currentNightlyRateUsd.toLocaleString()}`
                    : "—"}
                </TDNum>
                <TD>
                  {v.ownerVisible ? (
                    <Badge tone="success">Visible</Badge>
                  ) : (
                    <Badge tone="neutral">Hidden</Badge>
                  )}
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
