import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderProductivitySvg } from "@/lib/development/server/visual-reports/productivity-helpers";

export const metadata: Metadata = {
  title: "Workforce productivity · Development OS",
};
export const dynamic = "force-dynamic";

export default async function WorkforceProductivityPage() {
  const rows = [
    {
      monthLabel: "Jan",
      utilized: { pm: 280, engineer: 420, qs: 180 },
      totalCapacityHours: 1000,
    },
    {
      monthLabel: "Feb",
      utilized: { pm: 300, engineer: 460, qs: 200 },
      totalCapacityHours: 1000,
    },
    {
      monthLabel: "Mar",
      utilized: { pm: 290, engineer: 440, qs: 195 },
      totalCapacityHours: 1000,
    },
    {
      monthLabel: "Apr",
      utilized: { pm: 270, engineer: 420, qs: 170 },
      totalCapacityHours: 1000,
    },
  ];
  const svg = renderProductivitySvg(rows, { width: 800, height: 360 });

  return (
    <DevelopmentShell>
      <PageHeader
        title="Workforce productivity"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Reports", href: "/development-os/reports" },
          { label: "Workforce productivity" },
        ]}
        description="Per-role utilisation each month, with idle (gray) on top."
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
