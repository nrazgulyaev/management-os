import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import {
  listMaintenanceTemplates,
  listVillaMaintenancePlans,
} from "@/features/maintenance-intelligence/services";
import { listVillas } from "@/features/villas/services";
import { GenerateDuePlansButton } from "@/components/maintenance-intelligence/generate-due-button";
import { PlanAddButton } from "@/components/maintenance-intelligence/plan-add-button";

export const metadata = { title: "Maintenance plans" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  active: "success",
  paused: "warning",
  archived: "neutral",
};

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const [plans, villas, templates] = await Promise.all([
    listVillaMaintenancePlans({ status: sp.status || "active" }),
    listVillas(),
    listMaintenanceTemplates({ status: "active" }),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));
  const templateOpts = templates.map((t) => ({
    id: t.id,
    label: `${t.name} · ${t.category} · ${t.defaultFrequency}`,
    defaultFrequency: t.defaultFrequency,
    defaultIntervalDays: t.defaultIntervalDays,
    defaultDurationMinutes: t.defaultDurationMinutes,
    defaultPriority: t.defaultPriority,
    canBeDoneWhileOccupied: t.canBeDoneWhileOccupied,
    guestDisruptionLevel: t.guestDisruptionLevel,
    requiresVillaEmpty: t.requiresVillaEmpty,
  }));
  const now = new Date();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Maintenance intelligence", href: "/dashboard/maintenance-intelligence" },
          { label: "Plans" },
        ]}
        title="Maintenance plans"
        description="Per-villa instances of templates with cadence + preferences. Generate operation_tasks one at a time, accept a window suggestion, or batch-generate every plan whose next_due_at has elapsed."
        actions={
          <div className="flex items-center gap-2">
            <GenerateDuePlansButton />
            <PlanAddButton villas={villaOpts} templates={templateOpts} />
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-widest">
        {[
          { label: "Active", status: "active" },
          { label: "Paused", status: "paused" },
          { label: "Archived", status: "archived" },
        ].map((f) => (
          <Link
            key={f.status}
            href={`?status=${f.status}`}
            className={`px-3 py-1.5 rounded-full border ${
              (sp.status ?? "active") === f.status
                ? "bg-ink text-ink-inverse border-ink"
                : "border-line-soft text-ink-secondary hover:border-line-strong"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Section eyebrow="Plans" title={`${plans.length} rows`}>
        {plans.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            No plans.
          </p>
        ) : (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Plan</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-left px-3 py-2">Frequency</th>
                  <th className="text-left px-3 py-2">Next due</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {plans.map((p) => {
                  const overdue =
                    p.nextDueAt && new Date(p.nextDueAt).getTime() <= now.getTime();
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-ink font-medium">
                        {p.villaCode ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">
                        {p.planName}
                      </td>
                      <td className="px-3 py-2 text-ink-tertiary text-xs">
                        {p.templateCategory ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">
                        {p.frequency}
                        {p.intervalDays ? ` · ${p.intervalDays}d` : ""}
                      </td>
                      <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                        {p.nextDueAt
                          ? p.nextDueAt.slice(0, 16).replace("T", " ")
                          : "—"}
                        {overdue && (
                          <Badge tone="warning">overdue</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS_TONES[p.status] ?? "neutral"}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/dashboard/maintenance-intelligence/plans/${p.id}`}
                          className="text-xs text-ink hover:underline underline-offset-4"
                        >
                          Detail →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
