import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getWorkPackageByCode } from "@/lib/development/server/work-packages/work-package-queries";
import { listProjectTasks } from "@/lib/development/server/schedule/schedule-queries";

export const metadata: Metadata = { title: "Work package · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  planned: "neutral",
  ready_to_start: "info",
  in_progress: "info",
  completed: "success",
  on_hold: "warning",
  blocked: "warning",
  cancelled: "neutral",
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
        <PageHeader title="Work package" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const pkg = await getWorkPackageByCode(decodeURIComponent(code));
  if (!pkg) notFound();
  const tasks = await listProjectTasks({ workPackageId: pkg.id });

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          {
            label: "Work packages",
            href: `/development-os/projects/${slug}/work-packages`,
          },
          { label: pkg.packageCode },
        ]}
        eyebrow={`${pkg.status} · ${Number(pkg.progressPercentage).toFixed(0)}% complete`}
        title={pkg.name}
        description={pkg.description ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/work-packages`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Packages
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Schedule" title="Planned vs actual">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Planned start" value={pkg.plannedStart ?? "—"} />
          <Field label="Planned finish" value={pkg.plannedFinish ?? "—"} />
          <Field label="Actual start" value={pkg.actualStart ?? "—"} />
          <Field label="Actual finish" value={pkg.actualFinish ?? "—"} />
        </div>
      </Section>

      <Section eyebrow="Budget" title="Categories + amounts">
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
      </Section>

      <Section eyebrow="Scope" title={`${pkg.villaIds.length} villa(s)`}>
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
      </Section>

      <Section eyebrow="Tasks" title={`${tasks.length} task(s) in this package`}>
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
                    <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>
                      {t.status}
                    </Badge>
                  </TD>
                  <TD>
                    {t.isOnCriticalPath && <Badge tone="danger">CP</Badge>}
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
      </Section>
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
