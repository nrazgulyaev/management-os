import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Download, Lock, AlertTriangle } from "lucide-react";
import {
  getOwnerStatementById,
  getStatementPeriodById,
  listStatementLines,
} from "@/features/finance/services";
import { StatementDetail } from "@/components/finance/statement-detail";
import { setStatementStatusAction } from "@/features/finance/actions";
import { resolveDisputeAndReissue } from "@/features/finance/statement-actions";
import {
  listStatementAnomalies,
  type StatementAnomalyView,
} from "@/features/finance/statement-anomaly-detector";
import { runStatementAnomalyScanAction } from "@/features/finance/statement-anomaly-actions";
import { DetailPage } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import { DetailActionBar } from "@/components/dashboard/detail/detail-actionbar";

/**
 * Phase 2.1 PR 2 — Statement detail uses bricks B1 + B3 + B8 only.
 * No tabs, no side panel, no related strip — pure read-and-approve.
 * The B8 action bar surfaces sign-off requirements for draft/issued
 * statements; the existing server-action <form>s stay intact and
 * live in the header's actions slot.
 */

export const metadata = { title: "Owner statement" };
export const dynamic = "force-dynamic";

/** Human-readable one-liner for an anomaly flag. */
function describeAnomaly(a: StatementAnomalyView): string {
  const p = a.payload;
  switch (a.kind) {
    case "one_off_charge":
      return `Large ${String(p.lineType ?? "charge")} — "${String(p.description ?? p.category ?? "line")}" is ${String(p.pctOfGross ?? "?")}% of gross revenue.`;
    case "tax_anomaly":
      return `Tax is ${String(p.pctOfGross ?? "?")}% of gross revenue — unusually high.`;
    case "supplier_cost_spike":
      return `Supplier cost spike vs the trailing baseline.`;
    case "occupancy_drop":
      return `Occupancy dropped sharply vs prior periods.`;
    case "channel_mix_shift":
      return `Channel mix shifted materially vs prior periods.`;
    case "other":
      return p.reason === "negative_net_payout"
        ? `Net payout is negative — the owner owes money this period.`
        : p.reason === "zero_revenue_with_deductions"
          ? `Deductions exist but gross revenue is zero — revenue may be missing.`
          : `Anomaly flagged for review.`;
    default:
      return `Anomaly flagged for review.`;
  }
}

const SEVERITY_CLASS: Record<string, string> = {
  critical: "border-danger/40 bg-danger/5 text-danger",
  warn: "border-warning/40 bg-warning-weak/40 text-ink",
  info: "border-line-soft bg-muted/30 text-ink-secondary",
};

export default async function StatementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const statement = await getOwnerStatementById(id);
  if (!statement) notFound();
  const lines = await listStatementLines(id);
  const period = await getStatementPeriodById(statement.periodId);
  const anomalies = await listStatementAnomalies(id);
  const openAnomalies = anomalies.filter((a) => !a.resolvedAt);

  const transitions: { next: "issued" | "approved" | "paid" | "voided" | "draft"; label: string }[] =
    statement.status === "draft"
      ? [{ next: "issued", label: "Issue" }]
      : statement.status === "issued"
        ? [
            { next: "approved", label: "Approve" },
            { next: "voided", label: "Void" },
          ]
        : statement.status === "approved"
          ? [{ next: "paid", label: "Mark paid" }, { next: "voided", label: "Void" }]
          : [];

  const periodLocked = period?.status === "closed" || period?.status === "locked";
  const needsSignoff = statement.status === "draft" || statement.status === "issued";

  return (
    <DetailPage>
      {/* B1 — Header */}
      <DetailHeader
        breadcrumb={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Statements", href: "/dashboard/finance/statements" },
          { label: statement.statementCode },
        ]}
        title={`${statement.ownerName} · ${statement.villaCode ?? statement.projectName ?? "—"}`}
        meta={
          <>
            <span>{statement.periodLabel}</span>
            <span>·</span>
            <span>{statement.managementModel} model</span>
            <span>·</span>
            <span>STATUS: {statement.status}</span>
            <span>·</span>
            <span>OWNER: {statement.ownerState}</span>
          </>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="secondary" size="sm">
              <a href={`/dashboard/finance/statements/${id}/pdf`} target="_blank" rel="noopener noreferrer">
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                Download PDF
              </a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/dashboard/finance/transparency/statements/${id}`}>
                Open transparency
              </Link>
            </Button>
            <form
              action={async () => {
                "use server";
                await runStatementAnomalyScanAction(id);
              }}
            >
              <Button type="submit" size="sm" variant="secondary">
                Run anomaly scan
              </Button>
            </form>
            {transitions.map((t) => (
              <form
                key={t.next}
                action={async (formData: FormData) => {
                  "use server";
                  formData.set("id", id);
                  formData.set("next", t.next);
                  await setStatementStatusAction(null, formData);
                }}
              >
                <Button type="submit" size="sm" variant="secondary">
                  {t.label}
                </Button>
              </form>
            ))}
            {statement.ownerState === "disputed" && (
              <form
                action={async () => {
                  "use server";
                  const res = await resolveDisputeAndReissue(id);
                  if (res.ok && res.newStatementId) {
                    redirect(`/dashboard/finance/statements/${res.newStatementId}`);
                  }
                }}
              >
                <Button type="submit" size="sm">
                  Resolve &amp; reissue
                </Button>
              </form>
            )}
          </div>
        }
      />

      {/* B3 — Main panel */}
      <main className="flex flex-col gap-6 px-7 py-6">
        {periodLocked && (
          <div className="rounded-md border border-warning/30 bg-warning-weak/40 px-4 py-3 flex items-center gap-3 text-sm text-ink">
            <Lock className="w-4 h-4 text-warning" strokeWidth={1.75} />
            <span>
              <strong>{period?.label}</strong> is {period?.status}. Source ledger
              mutations are blocked at the database layer; statement regeneration
              is read-only against this period.
            </span>
          </div>
        )}

        {openAnomalies.length > 0 && (
          <section className="rounded-md border border-warning/30 bg-warning-weak/30 px-4 py-3 flex flex-col gap-2">
            <div className="text-sm font-medium text-ink flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" strokeWidth={1.75} />
              {openAnomalies.length} anomal{openAnomalies.length === 1 ? "y" : "ies"} flagged for review
            </div>
            <ul className="flex flex-col gap-1.5">
              {openAnomalies.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-xs">
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${SEVERITY_CLASS[a.severity] ?? SEVERITY_CLASS.info}`}
                  >
                    {a.severity}
                  </span>
                  <span className="text-ink-secondary">{describeAnomaly(a)}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-ink-tertiary">
              Deterministic checks — review each before approving. Re-run after any edit.
            </p>
          </section>
        )}

        <StatementDetail statement={statement} lines={lines} audience="internal" />

        <p className="text-xs text-ink-tertiary">
          Looking for source rows?{" "}
          <Link href="/dashboard/audit" className="underline">
            Open the audit log
          </Link>{" "}
          — every generation event records totals and source ids.
        </p>
      </main>

      {/* B8 — Sticky action bar. Visible when statement awaits a
          status transition; the actual transition forms live in the
          header to preserve the existing server-action wiring. */}
      <DetailActionBar
        requiresApproval={needsSignoff}
        approvalLabel={
          statement.status === "draft"
            ? "Issue from draft required"
            : "Director sign-off required"
        }
      />
    </DetailPage>
  );
}
