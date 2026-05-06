import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderCapitalTimelineSvg } from "@/lib/development/server/visual-reports/capital-timeline-helpers";

export const metadata: Metadata = {
  title: "Investor capital timeline · Development OS",
};
export const dynamic = "force-dynamic";

export default async function InvestorCapitalTimelinePage() {
  const rows = [
    { monthLabel: "Jan", contributionsMinor: 1_500_000_00, drawdownsMinor: 600_000_00, distributionsMinor: 0 },
    { monthLabel: "Feb", contributionsMinor: 800_000_00, drawdownsMinor: 1_100_000_00, distributionsMinor: 0 },
    { monthLabel: "Mar", contributionsMinor: 0, drawdownsMinor: 1_400_000_00, distributionsMinor: 200_000_00 },
    { monthLabel: "Apr", contributionsMinor: 2_000_000_00, drawdownsMinor: 1_200_000_00, distributionsMinor: 0 },
    { monthLabel: "May", contributionsMinor: 0, drawdownsMinor: 900_000_00, distributionsMinor: 350_000_00 },
    { monthLabel: "Jun", contributionsMinor: 600_000_00, drawdownsMinor: 700_000_00, distributionsMinor: 0 },
  ];
  const svg = renderCapitalTimelineSvg(rows, { width: 800, height: 360 });

  return (
    <DevelopmentShell>
      <PageHeader
        title="Investor capital timeline"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Reports", href: "/development-os/reports" },
          { label: "Investor capital timeline" },
        ]}
        description="Monthly stacked: contributions / drawdowns / distributions."
      />
      <Section title="Chart">
        <div
          className="rounded-md border border-line-soft bg-surface p-4 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </Section>
    </DevelopmentShell>
  );
}
