import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  getVillaMaintenancePlanById,
  listSuggestionsForPlan,
} from "@/features/maintenance-intelligence/services";
import { PlanActionBar } from "@/components/maintenance-intelligence/plan-action-bar";
import { SuggestionRow } from "@/components/maintenance-intelligence/suggestion-row";

export const metadata = { title: "Maintenance plan" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  active: "ok",
  paused: "warn",
  archived: "soft",
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/maintenance-intelligence">Maintenance intelligence</Link> /{" "}
            <Link href="/dashboard/maintenance-intelligence/plans">Plans</Link> /{" "}
            <span>{plan.planName}</span>
          </div>
          <h1>{plan.planName}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${plan.villaCode ?? "villa"} · ${plan.templateCategory ?? "category"} · ${plan.frequency}`}
          </p>
        </div>
        <div className="actions">
          <PlanActionBar id={plan.id} status={plan.status} />
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Plan</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="Status">
              <HandoffBadge tone={STATUS_TONES[plan.status] ?? "soft"}>
                {plan.status}
              </HandoffBadge>
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
                  <HandoffBadge tone="warn">overdue</HandoffBadge>
                )}
              </span>
            </Field>
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">
          Suggestions · {suggestions.length} window{suggestions.length === 1 ? "" : "s"}
        </div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Scored windows that respect calendar blocks, the plan's disruption rules, and the project's clustering limit. Top suggestion can be accepted to materialise an operation_task.
        </p>
        {suggestions.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            No suggestions yet. Use the "Refresh suggestions" button to compute candidates over the next 14 days.
          </p>
        ) : (
          <Card padding="none" overflowHidden>
            <ul className="divide-y divide-line-soft">
              {suggestions.map((s) => (
                <SuggestionRow key={s.id} suggestion={s} />
              ))}
            </ul>
          </Card>
        )}
      </div>
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
