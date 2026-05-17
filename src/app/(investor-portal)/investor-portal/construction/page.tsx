import { redirect } from "next/navigation";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getCurrentInvestorContext } from "@/features/investor-portal/investor-context";
import { getConstructionProgress } from "@/features/investor-portal/investor-portal-queries";

export const metadata = { title: "Construction" };
export const dynamic = "force-dynamic";

export default async function ConstructionPage() {
  const ctx = await getCurrentInvestorContext();
  if (!ctx) redirect("/dashboard/investors");
  const rows = await getConstructionProgress(ctx.investorId).catch(() => []);

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Investor portal · construction"
        title="Construction progress"
        subtitle="Live activity from work packages, site reports, and QA inspections across the projects you've committed capital to."
      />
      <section>
        <div className="label">Your projects</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Progress summary
        </h2>
        {rows.length === 0 ? (
          <Card style={{ padding: 24 }}>
            <p style={{ fontSize: 14, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
              No construction activity yet.
            </p>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <Table>
              <THead>
                <TR>
                  <TH>Project</TH>
                  <TH className="text-right">Work packages</TH>
                  <TH className="text-right">Site reports</TH>
                  <TH className="text-right">QA issues</TH>
                  <TH>Latest report</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.projectId}>
                    <TD className="font-medium">{r.projectName}</TD>
                    <TD className="text-right tabular-nums">{r.workPackagesCount}</TD>
                    <TD className="text-right tabular-nums">{r.siteReportsCount}</TD>
                    <TD className="text-right tabular-nums">{r.qaInspectionsCount}</TD>
                    <TD className="font-mono text-sm">
                      {r.latestReportDate ?? <Badge tone="outline">no reports</Badge>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
        <p style={{ fontSize: 11, color: "var(--ink-3)", fontStyle: "italic", marginTop: 14 }}>
          Site photos and per-milestone narrative will appear here once the
          documents pipeline is configured. Completion percentages and the
          full construction photo gallery are coming soon.
        </p>
      </section>
    </div>
  );
}
