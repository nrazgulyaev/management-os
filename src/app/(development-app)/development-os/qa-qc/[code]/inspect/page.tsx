import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getQaQcIssueByCode } from "@/lib/development/server/qa-qc/qa-qc-queries";
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
        <PageHeader title="Inspect" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getQaQcIssueByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { issue } = data;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "QA/QC", href: "/development-os/qa-qc" },
          {
            label: issue.issueCode,
            href: `/development-os/qa-qc/${issue.issueCode}`,
          },
          { label: "Inspect" },
        ]}
        eyebrow={`Status: ${issue.status}`}
        title="Record inspection"
        description={`Issue: ${issue.title}`}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/qa-qc/${issue.issueCode}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Issue
            </Link>
          </Button>
        }
      />

      {issue.status !== "ready_for_reinspection" ? (
        <EmptyState
          title="Issue not ready for inspection"
          description={`Current status is '${issue.status}'. Only 'ready_for_reinspection' issues can be inspected.`}
        />
      ) : (
        <Section eyebrow="Form" title="Inspection result">
          <QaQcInspectionForm issueId={issue.id} />
        </Section>
      )}
    </DevelopmentShell>
  );
}
