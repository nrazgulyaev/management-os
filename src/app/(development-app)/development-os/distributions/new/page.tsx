import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
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
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            {
              label: "Distributions",
              href: "/development-os/distributions",
            },
            { label: "New" },
          ]}
          title="Declare distribution"
        />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to declare distributions."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Distributions", href: "/development-os/distributions" },
          { label: "Declare" },
        ]}
        title="Declare distribution"
        description="Pick a project, type, and total amount. Preview the per-commitment allocation before declaring. Declared distributions create database rows but do NOT move balances until you click Execute on the detail page."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/distributions">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Inputs" title="Distribution parameters">
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
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Trigger reason">
            <select
              name="trigger"
              defaultValue={params.trigger ?? "manual"}
              required
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
            />
          </Field>
          <input type="hidden" name="preview" value="1" />
          <div className="md:col-span-2">
            <Button type="submit">Compute preview</Button>
          </div>
        </form>
      </Section>

      {previewError && (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          Preview failed: {previewError}
        </div>
      )}

      {preview && (
        <Section
          eyebrow="Preview"
          title={`${preview.allocations.length} allocation${preview.allocations.length === 1 ? "" : "s"}`}
          description={
            preview.unallocatedUsdMinor > 0n
              ? `Note: ${formatUsdMinor(preview.unallocatedUsdMinor)} would remain unallocated (no outstanding capital or profit-share weights to absorb it).`
              : "All funds allocated."
          }
        >
          {preview.allocations.length === 0 ? (
            <EmptyState
              title="Nothing to allocate"
              description="Either no active commitments exist for this project, or none have outstanding capital (for capital_return) / drawn capital (for profit_distribution)."
            />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Investor</TH>
                    <TH>Commitment</TH>
                    <TH>Capital return</TH>
                    <TH>Profit</TH>
                    <TH>Total</TH>
                    <TH>Profit %</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.allocations.map((a) => (
                    <TR key={a.commitmentId}>
                      <TD className="text-sm">{a.investorLegalName}</TD>
                      <TD className="font-mono text-xs">{a.commitmentCode}</TD>
                      <TDNum>
                        {formatUsdMinor(a.capitalReturnAmountUsdMinor)}
                      </TDNum>
                      <TDNum>{formatUsdMinor(a.profitAmountUsdMinor)}</TDNum>
                      <TDNum className="font-medium">
                        {formatUsdMinor(a.totalAmountUsdMinor)}
                      </TDNum>
                      <TDNum>
                        {Number(a.profitSharePercentUsed).toFixed(1)}%
                      </TDNum>
                    </TR>
                  ))}
                </TBody>
              </Table>

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
                <Button type="submit">Declare distribution</Button>
                <span className="text-xs text-ink-tertiary">
                  Creates rows in `distributions` and `distribution_allocations`. No
                  balances move until you click Execute.
                </span>
              </form>
            </>
          )}
        </Section>
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}
