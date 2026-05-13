import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listOpenSuggestions } from "@/features/maintenance-intelligence/services";

export const metadata = { title: "Maintenance windows" };
export const dynamic = "force-dynamic";

export default async function WindowsPage() {
  const rows = await listOpenSuggestions(200);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Maintenance intelligence", href: "/dashboard/maintenance-intelligence" },
          { label: "Window suggestions" },
        ]}
        title="Window suggestions"
        description="Top scored windows across every plan. Accept on the plan detail page to materialise an operation_task and (when needed) a maintenance_block."
      />
      <Section eyebrow="Open" title={`${rows.length} suggestions`}>
        {rows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            None. Open a plan and click "Refresh suggestions".
          </p>
        ) : (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Plan</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-left px-3 py-2">Window</th>
                  <th className="text-right px-3 py-2">Score</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink font-medium">
                      {r.villaCode ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{r.planName ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">{r.category ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.suggestedStart.slice(0, 16).replace("T", " ")} →{" "}
                      {r.suggestedEnd.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Badge tone={r.score >= 0.8 ? "success" : r.score >= 0.6 ? "info" : "warning"}>
                        {r.score.toFixed(2)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/dashboard/maintenance-intelligence/plans/${r.planId}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Plan →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
