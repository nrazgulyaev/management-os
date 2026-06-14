import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import {
  previewDistribution,
  type PreviewDistributionResult,
} from "@/lib/development/server/distributions";
import { declareDistribution } from "@/lib/development/server/distribution-actions";
import {
  DISTRIBUTION_TRIGGER_REASONS,
  DISTRIBUTION_TYPES,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Declare distribution · Development OS",
};
export const dynamic = "force-dynamic";

interface SearchParams {
  projectId?: string;
  type?: string;
  totalUsdMajor?: string;
  effectiveDate?: string;
  trigger?: string;
  notes?: string;
  preview?: string;
}

export default async function NewDistributionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/distributions">Distributions</Link> /{" "}
              <span>New</span>
            </div>
            <h1>Declare distribution</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to declare distributions."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const projectList = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .orderBy(projects.name);

  // Compute preview if all required fields are set.
  let preview: PreviewDistributionResult | null = null;
  let previewError: string | null = null;
  const havePreviewInputs =
    params.projectId &&
    params.type &&
    params.totalUsdMajor &&
    Number(params.totalUsdMajor) > 0;
  if (havePreviewInputs && (params.preview === "1" || true)) {
    try {
      const totalMinor = BigInt(
        Math.round(Number(params.totalUsdMajor) * 100),
      );
      preview = await previewDistribution({
        projectId:
          params.projectId === "__company"
            ? null
            : (params.projectId as string),
        totalAmountUsdMinor: totalMinor,
        distributionType: params.type as "capital_return" | "profit_distribution" | "mixed",
      });
    } catch (e) {
      previewError = String(e instanceof Error ? e.message : e);
    }
  }

  async function declareAction(formData: FormData) {
    "use server";
    const projectId = String(formData.get("projectId") ?? "");
    const type = String(formData.get("type") ?? "capital_return") as
      | "capital_return"
      | "profit_distribution"
      | "mixed";
    const totalMajor = Number(formData.get("totalUsdMajor") ?? 0);
    const effectiveDate = String(formData.get("effectiveDate") ?? "");
    const trigger = String(
      formData.get("trigger") ?? "manual",
    ) as "self_sustaining_threshold" | "project_exit" | "final_distribution" | "manual";
    const notes = String(formData.get("notes") ?? "");

    const result = await declareDistribution({
      projectId: projectId === "__company" ? null : projectId,
      distributionType: type,
      totalAmountUsdMinor: BigInt(Math.round(totalMajor * 100)),
      effectiveDate,
      triggerReason: trigger,
      notes: notes.length > 0 ? notes : null,
    });
    redirect(`/development-os/distributions/${result.distributionId}`);
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/distributions">Distributions</Link> /{" "}
            <span>Declare</span>
          </div>
          <h1>Declare distribution</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Pick a project, type, and total amount. Preview the per-commitment
            allocation before declaring. Declared distributions create database
            rows but do NOT move balances until you click Execute on the detail
            page.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/distributions"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Inputs</div>
        <Card padding="default">
        {/* GET form so the URL holds the preview state — no client JS needed. */}
        <form
          method="GET"
          action="/development-os/distributions/new"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <Field label="Project">
            <select
              name="projectId"
              defaultValue={params.projectId ?? ""}
              required
              className="select"
            >
              <option value="" disabled>
                Select a project…
              </option>
              <option value="__company">Company-wide (no project)</option>
              {projectList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Distribution type">
            <select
              name="type"
              defaultValue={params.type ?? "capital_return"}
              required
              className="select"
            >
              {DISTRIBUTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Total amount (USD)">
            <input
              type="number"
              name="totalUsdMajor"
              step="0.01"
              min="0.01"
              defaultValue={params.totalUsdMajor ?? ""}
              required
              className="input"
              placeholder="e.g. 200000"
            />
          </Field>
          <Field label="Effective date">
            <input
              type="date"
              name="effectiveDate"
              defaultValue={
                params.effectiveDate ?? new Date().toISOString().slice(0, 10)
              }
              required
              className="input"
            />
          </Field>
          <Field label="Trigger reason">
            <select
              name="trigger"
              defaultValue={params.trigger ?? "manual"}
              required
              className="select"
            >
              {DISTRIBUTION_TRIGGER_REASONS.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)">
            <input
              type="text"
              name="notes"
              defaultValue={params.notes ?? ""}
              className="input"
            />
          </Field>
          <input type="hidden" name="preview" value="1" />
          <div className="md:col-span-2">
            <button type="submit" className="btn btn-amber">
              Compute preview
            </button>
          </div>
        </form>
        </Card>
      </div>

      {previewError && (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          Preview failed: {previewError}
        </div>
      )}

      {preview && (
        <div>
          <div className="label mb-2.5">Preview</div>
          <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
            {`${preview.allocations.length} allocation${preview.allocations.length === 1 ? "" : "s"}`}
            {" — "}
            {preview.unallocatedUsdMinor > 0n
              ? `Note: ${formatUsdMinor(preview.unallocatedUsdMinor)} would remain unallocated (no outstanding capital or profit-share weights to absorb it).`
              : "All funds allocated."}
          </p>
          {preview.allocations.length === 0 ? (
            <EmptyState
              title="Nothing to allocate"
              description="Either no active commitments exist for this project, or none have outstanding capital (for capital_return) / drawn capital (for profit_distribution)."
            />
          ) : (
            <>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data w-full">
                    <thead>
                      <tr>
                        <th>Investor</th>
                        <th>Commitment</th>
                        <th className="num">Capital return</th>
                        <th className="num">Profit</th>
                        <th className="num">Total</th>
                        <th className="num">Profit %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.allocations.map((a) => (
                        <tr key={a.commitmentId}>
                          <td className="row-title">{a.investorLegalName}</td>
                          <td className="font-mono text-xs">
                            {a.commitmentCode}
                          </td>
                          <td className="num">
                            {formatUsdMinor(a.capitalReturnAmountUsdMinor)}
                          </td>
                          <td className="num">
                            {formatUsdMinor(a.profitAmountUsdMinor)}
                          </td>
                          <td className="num font-medium">
                            {formatUsdMinor(a.totalAmountUsdMinor)}
                          </td>
                          <td className="num text-ink-3">
                            {Number(a.profitSharePercentUsed).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <form action={declareAction} className="mt-4 flex items-center gap-3">
                <input type="hidden" name="projectId" value={params.projectId} />
                <input type="hidden" name="type" value={params.type} />
                <input
                  type="hidden"
                  name="totalUsdMajor"
                  value={params.totalUsdMajor}
                />
                <input
                  type="hidden"
                  name="effectiveDate"
                  value={params.effectiveDate ?? new Date().toISOString().slice(0, 10)}
                />
                <input type="hidden" name="trigger" value={params.trigger ?? "manual"} />
                <input type="hidden" name="notes" value={params.notes ?? ""} />
                <button type="submit" className="btn btn-amber">
                  Declare distribution
                </button>
                <span className="text-xs text-ink-4">
                  Creates rows in `distributions` and `distribution_allocations`. No
                  balances move until you click Execute.
                </span>
              </form>
            </>
          )}
        </div>
      )}
    </DevelopmentShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
