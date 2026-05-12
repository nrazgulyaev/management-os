import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listRatePlans } from "@/features/pricing/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { RatePlanAddButton } from "@/components/pricing/rate-plan-add-button";

export const metadata = { title: "Rate plans" };
export const dynamic = "force-dynamic";

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default async function RatePlansPage() {
  const [plans, villas, projects] = await Promise.all([
    listRatePlans(),
    listVillas(),
    listProjects(),
  ]);
  const villaOpts = villas.map((v) => ({
    id: v.id,
    label: `${v.unitCode} · ${v.projectName ?? ""}`,
  }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Rate plans" },
        ]}
        title="Rate plans"
        description="Per-villa or per-project nightly rate + seasons + overrides. Used by the owner-stay estimator and (in v9C+) the direct-booking quote endpoint."
        actions={<RatePlanAddButton villas={villaOpts} projects={projectOpts} />}
      />

      <div className="rounded-md border border-info-weak/40 bg-info-weak/20 px-5 py-3 text-xs text-info">
        Basic rate plans are still supported. Dynamic pricing rule sets now
        power the quote engine when configured —
        <Link href="/dashboard/pricing/rule-sets" className="ml-1 underline underline-offset-4">
          manage rule sets →
        </Link>
      </div>

      <Section eyebrow="Catalog" title={`${plans.length} plans`}>
        {plans.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No rate plans yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-right px-3 py-2">Base nightly</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-ink font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {p.villaCode ? `villa ${p.villaCode}` : p.projectName ? `project ${p.projectName}` : "global"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(p.baseNightlyRateMinor, p.baseCurrency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={p.status === "active" ? "success" : "neutral"}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/dashboard/bookings/rates/${p.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Detail →
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
