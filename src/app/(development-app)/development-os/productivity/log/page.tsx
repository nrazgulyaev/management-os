import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { recordProductivityLog } from "@/lib/development/server/productivity/productivity-actions";
import { getCurrentAppUser } from "@/features/auth/current-user";

export const metadata: Metadata = { title: "Log productivity · Schedule" };
export const dynamic = "force-dynamic";

/**
 * Wire-up sweep — real productivity log form (was an instructional stub).
 * recordProductivityLog existed ("use server") with no form. Productivity
 * rate is a GENERATED column (quantity_completed / actual_hours).
 */
export default async function NewProductivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const me = await getCurrentAppUser().catch(() => null);

  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Log productivity</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  if (!me?.id) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Log productivity</h1>
          </div>
        </div>
        <EmptyState
          title="Sign-in required"
          description="Productivity logs are recorded against your app user — sign in to log an entry."
        />
      </DevelopmentShell>
    );
  }

  const projectList = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(projects.name);

  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(formData: FormData) {
    "use server";
    const me2 = await getCurrentAppUser().catch(() => null);
    if (!me2?.id) redirect("/development-os/productivity/log?error=auth");
    const numOpt = (k: string) => {
      const v = formData.get(k);
      const n = v == null || v === "" ? undefined : Number(v);
      return n != null && Number.isFinite(n) ? n : undefined;
    };
    const str = (k: string) => {
      const v = (formData.get(k) ?? "").toString().trim();
      return v === "" ? undefined : v;
    };
    const result = await recordProductivityLog({
      projectId: String(formData.get("projectId") ?? ""),
      logDate: String(formData.get("logDate") ?? ""),
      tradeCategory: str("tradeCategory"),
      activityDescription: str("activityDescription"),
      plannedHours: numOpt("plannedHours"),
      actualHours: Number(formData.get("actualHours") ?? 0),
      quantityCompleted: numOpt("quantityCompleted"),
      unitOfMeasure: str("unitOfMeasure"),
      dataSource: "manual_entry",
      recordedBy: me2!.id,
    });
    if (!result.ok) {
      redirect(
        `/development-os/productivity/log?error=${encodeURIComponent(result.error ?? "failed")}`,
      );
    }
    redirect("/development-os/productivity");
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/productivity">Productivity</Link> /{" "}
            <span>Log entry</span>
          </div>
          <h1>Log productivity</h1>
        </div>
        <div className="actions">
          <Link
            href="/development-os/productivity"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Manual entry</div>
        <Card padding="default">
        {sp.error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {sp.error === "auth"
              ? "Sign-in required."
              : `Could not save: ${sp.error}`}
          </div>
        )}
        <form action={handleSubmit} className="max-w-2xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Project" required>
              <select name="projectId" required className={inputCls} defaultValue="">
                <option value="" disabled>
                  Select project…
                </option>
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Log date" required>
              <input type="date" name="logDate" required defaultValue={today} className={inputCls} />
            </Field>
            <Field label="Trade / category">
              <input name="tradeCategory" placeholder="masonry, electrical…" className={inputCls} />
            </Field>
            <Field label="Unit of measure">
              <input name="unitOfMeasure" placeholder="m², pcs, m³…" className={inputCls} />
            </Field>
            <Field label="Planned hours">
              <input type="number" name="plannedHours" min={0} step="any" className={inputCls} />
            </Field>
            <Field label="Actual hours" required>
              <input type="number" name="actualHours" min={0.01} step="any" required className={inputCls} />
            </Field>
            <Field label="Quantity completed">
              <input type="number" name="quantityCompleted" min={0} step="any" className={inputCls} />
            </Field>
          </div>
          <Field label="Activity description">
            <textarea name="activityDescription" rows={3} className={inputCls} placeholder="What was done…" />
          </Field>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-accent">
              Save log entry
            </button>
            <Link
              href="/development-os/productivity"
              className="btn btn-secondary"
            >
              Cancel
            </Link>
          </div>
          <p className="text-[11px] text-ink-tertiary">
            Productivity rate is computed automatically (quantity ÷ actual hours)
            when both are present.
          </p>
        </form>
        </Card>
      </div>
    </DevelopmentShell>
  );
}

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2.5 py-1.5 text-sm";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
      <span>
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}
