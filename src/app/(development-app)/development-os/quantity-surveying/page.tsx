import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Calculator } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = {
  title: "Quantity surveying · Development OS",
};
export const dynamic = "force-dynamic";

export default async function QuantitySurveyingPlaceholderPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Quantity surveying" },
        ]}
        eyebrow="Roadmap"
        title="Quantity surveying — Coming Soon"
        description="Bill of Quantities, cost estimation, variation orders, and valuation runs. Today's QS workflow lives in the existing Work Packages + Change Orders + Inventory modules; this dedicated surface will roll those up into a single QS-friendly view."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Planned" title="QS workflows we're considering">
        <ul className="space-y-3">
          {[
            {
              name: "Bill of Quantities (BoQ)",
              desc: "Structured material + labor takeoffs per work package, valued at current SKU prices.",
            },
            {
              name: "Cost estimation",
              desc: "Pre-tender estimation with confidence bands and contingency calculation.",
            },
            {
              name: "Variation orders",
              desc: "Today: change_orders. Future: structured BoQ-aware variation pricing tied to original quotation.",
            },
            {
              name: "Valuation runs",
              desc: "Monthly progress valuations: % complete × contract value, with retention tracking.",
            },
          ].map((p) => (
            <li
              key={p.name}
              className="rounded-lg border border-line-soft bg-surface p-4 flex gap-3"
            >
              <Calculator className="w-5 h-5 text-ink-secondary shrink-0" strokeWidth={1.5} />
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-ink">{p.name}</h4>
                  <Badge tone="neutral">soon</Badge>
                </div>
                <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                  {p.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </DevelopmentShell>
  );
}
