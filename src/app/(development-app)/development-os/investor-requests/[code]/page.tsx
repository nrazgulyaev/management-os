import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getInvestorPortalRequestByCode } from "@/lib/development/server/investor-portal-requests/request-queries";
import { RequestReviewActions } from "@/components/development/investor-portal-requests/request-review-actions";

export const metadata: Metadata = {
  title: "Investor request · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  submitted: "warning",
  under_review: "info",
  approved: "info",
  executed: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export default async function InvestorRequestDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Investor request" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const req = await getInvestorPortalRequestByCode(decodeURIComponent(code));
  if (!req) notFound();

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Investor requests", href: "/development-os/investor-requests" },
          { label: req.requestCode },
        ]}
        eyebrow={`${req.requestType} · ${req.status}`}
        title={req.requestCode}
        description={req.investorNotes ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/investor-requests">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Inbox
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Header" title="Request">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Type" value={req.requestType} />
          <Field
            label="Amount"
            value={`$${(Number(req.requestedAmountMinor) / 100).toLocaleString()} ${req.currency}`}
          />
          <Field label="Status" value={req.status} />
          <Field
            label="Investor"
            value={req.investorId.slice(0, 8)}
            mono
          />
          <Field
            label="Source project"
            value={req.sourceProjectId?.slice(0, 8) ?? "—"}
            mono
          />
          <Field
            label="Target project"
            value={req.targetProjectId?.slice(0, 8) ?? "—"}
            mono
          />
          <Field
            label="Submitted"
            value={new Date(req.submittedAt).toLocaleString()}
          />
          <Field
            label="Reviewed"
            value={req.reviewedAt ? new Date(req.reviewedAt).toLocaleString() : "—"}
          />
          <Field
            label="Executed"
            value={req.executedAt ? new Date(req.executedAt).toLocaleString() : "—"}
          />
          <Field
            label="Wallet movement"
            value={req.relatedWalletMovementId?.slice(0, 8) ?? "—"}
            mono
          />
          <Field
            label="Preferred date"
            value={req.preferredExecutionDate ?? "—"}
          />
        </div>
      </Section>

      {req.investorNotes && (
        <Section eyebrow="Investor notes" title="Why">
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">
            {req.investorNotes}
          </p>
        </Section>
      )}

      {req.approvalNotes && (
        <Section eyebrow="Approval" title="Operator approval notes">
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">
            {req.approvalNotes}
          </p>
        </Section>
      )}

      {req.rejectionReason && (
        <Section eyebrow="Rejection" title="Operator rejection reason">
          <p className="text-sm text-danger whitespace-pre-wrap">
            {req.rejectionReason}
          </p>
        </Section>
      )}

      <Section
        eyebrow="HITL"
        title={
          ["submitted", "under_review", "approved"].includes(req.status)
            ? `Status: ${req.status} → next action`
            : `Status: ${req.status}`
        }
      >
        <Badge tone={STATUS_TONE[req.status] ?? "neutral"}>
          {req.status}
        </Badge>
        <div className="mt-4">
          <RequestReviewActions requestId={req.id} status={req.status} />
        </div>
        <p className="text-[11px] text-ink-tertiary mt-3">
          Approval is necessary but not sufficient — execution writes the
          wallet_movement atomically and links it back to this request.
        </p>
      </Section>
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs break-all" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
