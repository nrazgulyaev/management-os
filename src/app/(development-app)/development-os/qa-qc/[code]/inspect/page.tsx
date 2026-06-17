import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getQaQcIssueByCode } from "@/lib/development/server/qa-qc/qa-qc-queries";
import { listQualityStandards } from "@/lib/development/server/quality-standards/quality-standard-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { QaQcInspectionForm } from "@/components/development/qa-qc/qa-qc-inspection-form";

export const metadata: Metadata = { title: "Inspect · Development OS" };
export const dynamic = "force-dynamic";

export default async function QaQcInspectPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Inspect</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getQaQcIssueByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { issue } = data;

  const standards = await safeQuery(
    "listQualityStandards",
    listQualityStandards(),
    [],
    4000,
  );
  const standardOptions = standards.map((s) => ({
    id: s.id,
    label: `${s.standardCode} · ${s.title}`,
  }));

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/qa-qc">QA/QC</Link> /{" "}
            <Link href={`/development-os/qa-qc/${issue.issueCode}`}>
              {issue.issueCode}
            </Link>{" "}
            / <span>Inspect</span>
          </div>
          <h1>Record inspection</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Issue: {issue.title}
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/qa-qc/${issue.issueCode}`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Issue
          </Link>
        </div>
      </div>

      {issue.status !== "ready_for_reinspection" ? (
        <EmptyState
          title="Issue not ready for inspection"
          description={`Current status is '${issue.status}'. Only 'ready_for_reinspection' issues can be inspected.`}
        />
      ) : (
        <div>
          <div className="label mb-2.5">Form</div>
          <Card padding="default">
            <QaQcInspectionForm
              issueId={issue.id}
              standards={standardOptions}
            />
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
