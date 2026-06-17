import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getInvestorPortalRequestByCode } from "@/lib/development/server/investor-portal-requests/request-queries";
import { RequestReviewActions } from "@/components/development/investor-portal-requests/request-review-actions";

export const metadata: Metadata = {
  title: "Investor request · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  submitted: "warn",
  under_review: "info",
  approved: "info",
  executed: "ok",
  rejected: "danger",
  cancelled: "soft",
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
        <div className="page-header">
          <div className="left">
            <h1>Investor request</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const req = await getInvestorPortalRequestByCode(decodeURIComponent(code));
  if (!req) notFound();

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/investor-requests">Investor requests</Link> /{" "}
            <span>{req.requestCode}</span>
          </div>
          <h1>{req.requestCode}</h1>
          {req.investorNotes && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {req.investorNotes}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href="/development-os/investor-requests"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Inbox
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Header</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field label="Type" value={req.requestType} />
            <Field
              label="Amount"
              value={`$${(Number(req.requestedAmountMinor) / 100).toLocaleString()} ${req.currency}`}
            />
            <Field label="Status" value={req.status} />
            <Field
              label="Investor"
              value={req.investorLegalName ?? req.investorId.slice(0, 8)}
              href={
                req.investorCode
                  ? `/development-os/investors/${req.investorCode}`
                  : undefined
              }
              mono={!req.investorLegalName}
            />
            <Field
              label="Source project"
              value={
                req.sourceProjectName ??
                (req.sourceProjectId ? req.sourceProjectId.slice(0, 8) : "—")
              }
              href={
                req.sourceProjectSlug
                  ? `/development-os/projects/${req.sourceProjectSlug}`
                  : undefined
              }
              mono={!req.sourceProjectName && !!req.sourceProjectId}
            />
            <Field
              label="Target project"
              value={
                req.targetProjectName ??
                (req.targetProjectId ? req.targetProjectId.slice(0, 8) : "—")
              }
              href={
                req.targetProjectSlug
                  ? `/development-os/projects/${req.targetProjectSlug}`
                  : undefined
              }
              mono={!req.targetProjectName && !!req.targetProjectId}
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
        </Card>
      </div>

      {req.investorNotes && (
        <div>
          <div className="label mb-2.5">Investor notes</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary whitespace-pre-wrap">
              {req.investorNotes}
            </p>
          </Card>
        </div>
      )}

      {req.approvalNotes && (
        <div>
          <div className="label mb-2.5">Approval</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary whitespace-pre-wrap">
              {req.approvalNotes}
            </p>
          </Card>
        </div>
      )}

      {req.rejectionReason && (
        <div>
          <div className="label mb-2.5">Rejection</div>
          <Card padding="default">
            <p className="text-sm text-danger whitespace-pre-wrap">
              {req.rejectionReason}
            </p>
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">HITL</div>
        <Card padding="default">
          <HandoffBadge tone={STATUS_TONE[req.status] ?? "soft"}>
            {req.status}
          </HandoffBadge>
          <div className="mt-4">
            <RequestReviewActions requestId={req.id} status={req.status} />
          </div>
          <p className="text-[11px] text-ink-tertiary mt-3">
            Approval is necessary but not sufficient — execution writes the
            wallet_movement atomically and links it back to this request.
          </p>
        </Card>
      </div>
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  const valueCls = `mt-0.5 ${mono ? "font-mono text-xs break-all" : "text-sm"}`;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={valueCls}>
        {href ? (
          <Link href={href} className="hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </div>
    </div>
  );
}
