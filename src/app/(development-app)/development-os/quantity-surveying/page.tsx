import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Calculator } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = {
  title: "Quantity surveying · Development OS",
};
export const dynamic = "force-dynamic";

export default async function QuantitySurveyingPlaceholderPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Quantity surveying</span>
          </div>
          <h1>Quantity surveying — Coming Soon</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Bill of Quantities, cost estimation, variation orders, and
            valuation runs. Today&apos;s QS workflow lives in the existing Work
            Packages + Change Orders + Inventory modules; this dedicated surface
            will roll those up into a single QS-friendly view.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os" className="btn btn-secondary">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Planned</div>
        <Card padding="default">
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
                    <HandoffBadge tone="soft">soon</HandoffBadge>
                  </div>
                  <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                    {p.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </DevelopmentShell>
  );
}
