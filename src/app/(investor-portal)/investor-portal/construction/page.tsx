import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
      <PageHeader
        breadcrumbs={[
          { label: "Investor portal", href: "/investor-portal" },
          { label: "Construction" },
        ]}
        title="Construction progress"
        description="Live activity from work packages, site reports, and QA inspections across the projects you've committed capital to."
      />
      <Section eyebrow="Your projects" title="Progress summary">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">No construction activity yet.</p>
        ) : (
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
        )}
        <p className="text-[11px] text-ink-tertiary italic mt-4">
          Site photos and per-milestone narrative will appear here once the
          documents pipeline is configured. Completion percentages and the
          full construction photo gallery are coming soon.
        </p>
      </Section>
    </div>
  );
}
