import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listPricingRuleSets } from "@/features/dynamic-pricing/services";

export const metadata = { title: "Pricing rule sets" };
export const dynamic = "force-dynamic";

export default async function RuleSetsPage() {
  const sets = await listPricingRuleSets();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Dynamic pricing", href: "/dashboard/pricing" },
          { label: "Rule sets" },
        ]}
        title="Rule sets"
        description="Each rule set is the top of a (scope, priority, base) triple that drives nightly pricing."
        actions={
          <Link
            href="/dashboard/pricing/rule-sets/new"
            className="h-9 px-4 inline-flex items-center rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
          >
            New rule set
          </Link>
        }
      />
      <Section eyebrow="Catalog" title={`${sets.length} rule sets`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sets.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-tertiary">
                    No rule sets yet — seed or create one.
                  </td>
                </tr>
              )}
              {sets.map((rs) => (
                <tr key={rs.id} className="border-t border-line-soft">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/pricing/rule-sets/${rs.id}`}
                      className="text-ink hover:underline underline-offset-4"
                    >
                      {rs.name}
                    </Link>
                    <div className="text-[10px] font-mono text-ink-tertiary">{rs.ruleSetCode}</div>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{rs.scopeType}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {(rs.baseRateMinor / 100n).toString()}.
                    {String(rs.baseRateMinor % 100n).padStart(2, "0")} {rs.currency}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{rs.priority}</td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        rs.status === "active"
                          ? "success"
                          : rs.status === "paused"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {rs.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
