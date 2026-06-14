import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  listMaintenanceTemplates,
  listVillaMaintenancePlans,
} from "@/features/maintenance-intelligence/services";
import { listVillas } from "@/features/villas/services";
import { GenerateDuePlansButton } from "@/components/maintenance-intelligence/generate-due-button";
import { PlanAddButton } from "@/components/maintenance-intelligence/plan-add-button";

export const metadata = { title: "Maintenance plans" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  active: "ok",
  paused: "warn",
  archived: "soft",
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/maintenance-intelligence">Maintenance intelligence</Link> /{" "}
            <span>Plans</span>
          </div>
          <h1>Maintenance plans</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-villa instances of templates with cadence + preferences. Generate operation_tasks one at a time, accept a window suggestion, or batch-generate every plan whose next_due_at has elapsed.
          </p>
        </div>
        <div className="actions">
          <GenerateDuePlansButton />
          <PlanAddButton villas={villaOpts} templates={templateOpts} />
        </div>
      </div>

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

      <div>
        <div className="label mb-2.5">Plans · {plans.length} rows</div>
        {plans.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            No plans.
          </p>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Villa</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Category</th>
                  <th scope="col">Frequency</th>
                  <th scope="col">Next due</th>
                  <th scope="col">Status</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const overdue =
                    p.nextDueAt && new Date(p.nextDueAt).getTime() <= now.getTime();
                  return (
                    <tr key={p.id}>
                      <td className="row-title">{p.villaCode ?? "—"}</td>
                      <td>{p.planName}</td>
                      <td className="text-ink-3 text-[12px]">
                        {p.templateCategory ?? "—"}
                      </td>
                      <td>
                        {p.frequency}
                        {p.intervalDays ? ` · ${p.intervalDays}d` : ""}
                      </td>
                      <td className="tabular-nums text-ink-3">
                        {p.nextDueAt
                          ? p.nextDueAt.slice(0, 16).replace("T", " ")
                          : "—"}
                        {overdue && (
                          <HandoffBadge tone="warn">overdue</HandoffBadge>
                        )}
                      </td>
                      <td>
                        <HandoffBadge tone={STATUS_TONES[p.status] ?? "soft"}>
                          {p.status}
                        </HandoffBadge>
                      </td>
                      <td className="text-right">
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
          </Card>
        )}
      </div>
    </div>
  );
}
