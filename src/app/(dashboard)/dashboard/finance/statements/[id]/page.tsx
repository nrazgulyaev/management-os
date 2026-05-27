import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Download, Lock } from "lucide-react";
import {
  getOwnerStatementById,
  getStatementPeriodById,
  listStatementLines,
} from "@/features/finance/services";
import { StatementDetail } from "@/components/finance/statement-detail";
import { setStatementStatusAction } from "@/features/finance/actions";
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
