import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import {
  getVillaMaintenancePlanById,
  listSuggestionsForPlan,
} from "@/features/maintenance-intelligence/services";
import { PlanActionBar } from "@/components/maintenance-intelligence/plan-action-bar";
import { SuggestionRow } from "@/components/maintenance-intelligence/suggestion-row";

export const metadata = { title: "Maintenance plan" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  active: "success",
  paused: "warning",
  archived: "neutral",
};

export default async function PlanDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [plan, suggestions] = await Promise.all([
    getVillaMaintenancePlanById(id),
    listSuggestionsForPlan(id),
  ]);
  if (!plan) notFound();

  const overdue =
    plan.nextDueAt &&
    new Date(plan.nextDueAt).getTime() <= Date.now();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Maintenance intelligence", href: "/dashboard/maintenance-intelligence" },
          { label: "Plans", href: "/dashboard/maintenance-intelligence/plans" },
          { label: plan.planName },
        ]}
        title={plan.planName}
        description={`${plan.villaCode ?? "villa"} · ${plan.templateCategory ?? "category"} · ${plan.frequency}`}
        actions={<PlanActionBar id={plan.id} status={plan.status} />}
      />

      <Section eyebrow="Plan" title="Configuration">
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Status">
            <Badge tone={STATUS_TONES[plan.status] ?? "neutral"}>
              {plan.status}
            </Badge>
          </Field>
          <Field label="Frequency" value={`${plan.frequency}${plan.intervalDays ? ` · ${plan.intervalDays}d` : ""}`} />
          <Field label="Duration" value={`${plan.durationMinutes} min`} />
          <Field label="Priority" value={plan.priority} />
          <Field label="Disruption" value={plan.guestDisruptionLevel} />
          <Field label="Requires villa empty" value={plan.requiresVillaEmpty ? "yes" : "no"} />
          <Field
            label="Last completed"
            value={plan.lastCompletedAt?.slice(0, 16).replace("T", " ") ?? "—"}
          />
          <Field label="Next due">
            <span>
              {plan.nextDueAt ? plan.nextDueAt.slice(0, 16).replace("T", " ") : "—"}
              {overdue && (
                <Badge tone="warning">overdue</Badge>
              )}
            </span>
          </Field>
        </div>
      </Section>

      <Section
        eyebrow="Suggestions"
        title={`${suggestions.length} window${suggestions.length === 1 ? "" : "s"}`}
        description="Scored windows that respect calendar blocks, the plan's disruption rules, and the project's clustering limit. Top suggestion can be accepted to materialise an operation_task."
      >
        {suggestions.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No suggestions yet. Use the "Refresh suggestions" button to compute candidates over the next 14 days.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {suggestions.map((s) => (
                <SuggestionRow key={s.id} suggestion={s} />
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="mt-1">{children ?? <span>{value}</span>}</div>
    </div>
  );
}
