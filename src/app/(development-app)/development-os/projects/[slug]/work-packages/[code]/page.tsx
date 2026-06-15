import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getWorkPackageByCode } from "@/lib/development/server/work-packages/work-package-queries";
import { listProjectTasks } from "@/lib/development/server/schedule/schedule-queries";

export const metadata: Metadata = { title: "Work package · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "soft"> = {
  planned: "soft",
  ready_to_start: "info",
  in_progress: "info",
  completed: "ok",
  on_hold: "warn",
  blocked: "warn",
  cancelled: "soft",
};

export default async function WorkPackageDetailPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Work package</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const pkg = await getWorkPackageByCode(decodeURIComponent(code));
  if (!pkg) notFound();
  const tasks = await listProjectTasks({ workPackageId: pkg.id });

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/work-packages`}>
              Work packages
            </Link>{" "}
            / <span>{pkg.packageCode}</span>
          </div>
          <h1>{pkg.name}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {pkg.status} ·{" "}
            {Number(pkg.progressPercentage).toFixed(0)}% complete
            {pkg.description ? ` — ${pkg.description}` : ""}
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/work-packages`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Packages
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Schedule</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Field label="Planned start" value={pkg.plannedStart ?? "—"} />
            <Field label="Planned finish" value={pkg.plannedFinish ?? "—"} />
            <Field label="Actual start" value={pkg.actualStart ?? "—"} />
            <Field label="Actual finish" value={pkg.actualFinish ?? "—"} />
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Budget</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Field
              label="Budget"
              value={
                pkg.budgetAmountMinor != null
                  ? `$${(Number(pkg.budgetAmountMinor) / 100).toLocaleString()}`
                  : "—"
              }
            />
            <Field
              label="Committed"
              value={
                pkg.committedAmountMinor != null
                  ? `$${(Number(pkg.committedAmountMinor) / 100).toLocaleString()}`
                  : "—"
              }
            />
            <Field
              label="Actual"
              value={
                pkg.actualAmountMinor != null
                  ? `$${(Number(pkg.actualAmountMinor) / 100).toLocaleString()}`
                  : "—"
              }
            />
            <Field
              label="Categories linked"
              value={String(pkg.budgetCategories.length)}
            />
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Scope · {pkg.villaIds.length} villa(s)</div>
        <Card padding="default">
          {pkg.villaIds.length === 0 ? (
            <p className="text-sm text-ink-tertiary">
              Project-wide scope (no specific villas).
            </p>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              {pkg.villaIds.map((id) => (
                <li
                  key={id}
                  className="font-mono text-xs rounded border border-line-soft p-2"
                >
                  {id.slice(0, 8)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">
          Tasks · {tasks.length} task(s) in this package
        </div>
        {tasks.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            description="Add tasks to this work package via the Schedule tab."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Critical</TH>
                <TH>Start</TH>
                <TH>Finish</TH>
                <TH>Days</TH>
                <TH>Float</TH>
              </TR>
            </THead>
            <TBody>
              {tasks.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-xs">{t.taskCode}</TD>
                  <TD className="text-sm">{t.name}</TD>
                  <TD>
                    <HandoffBadge tone={STATUS_TONE[t.status] ?? "soft"}>
                      {t.status}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    {t.isOnCriticalPath && (
                      <HandoffBadge tone="danger">CP</HandoffBadge>
                    )}
                  </TD>
                  <TD className="text-xs">{t.plannedStart}</TD>
                  <TD className="text-xs">{t.plannedFinish}</TD>
                  <TDNum>{t.durationDays ?? "—"}</TDNum>
                  <TDNum>
                    {t.totalFloatDays != null ? t.totalFloatDays : "—"}
                  </TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}
