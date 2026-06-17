import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getChangeOrderByCode } from "@/lib/development/server/change-orders/change-order-queries";
import { lookupChangeOrderApproval } from "@/lib/development/server/change-orders/change-order-actions";
import { listApprovalThresholds } from "@/lib/development/server/procurement/procurement-actions";
import { safeQuery } from "@/lib/development/safe-query";
import { ChangeOrderControls } from "./_controls";

export const metadata: Metadata = { title: "Change order · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  requested: "warn",
  under_review: "info",
  approved: "info",
  in_progress: "info",
  completed: "ok",
  rejected: "danger",
  cancelled: "soft",
};

export default async function ChangeOrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Change order</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const co = await getChangeOrderByCode(decodeURIComponent(code));
  if (!co) notFound();

  // Required approval role — prefer the stored value, else derive it live from
  // the configurable thresholds matrix via lookupChangeOrderApproval.
  let requiredApprovalRole: string | null = co.requiredApprovalRole ?? null;
  if (!requiredApprovalRole) {
    const thresholds = await safeQuery(
      "listApprovalThresholds",
      listApprovalThresholds(),
      [],
      4000,
    );
    if (thresholds.length > 0) {
      const lookup = await safeQuery(
        "lookupChangeOrderApproval",
        lookupChangeOrderApproval({ changeOrderId: co.id, thresholds }),
        null,
        4000,
      );
      requiredApprovalRole = lookup?.requiredRole ?? null;
    }
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/change-orders`}>
              Change orders
            </Link>{" "}
            / <span>{co.changeOrderCode}</span>
          </div>
          <h1>{co.title}</h1>
          {co.reason && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {co.reason}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/change-orders`}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All
          </Link>
        </div>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="mb-3">
            <HandoffBadge tone={STATUS_TONE[co.status] ?? "soft"}>
              {co.status}
            </HandoffBadge>
          </div>
          <ChangeOrderControls
            changeOrderId={co.id}
            slug={slug}
            code={decodeURIComponent(code)}
            status={co.status}
            requiredApprovalRole={requiredApprovalRole}
          />
        </Card>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Impact</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field
              label="Cost impact"
              value={`${Number(co.costImpactMinor) >= 0 ? "+" : ""}$${(Number(co.costImpactMinor) / 100).toLocaleString()} ${co.costImpactCurrency}`}
            />
            <Field
              label="Schedule impact"
              value={`${co.scheduleImpactDays >= 0 ? "+" : ""}${co.scheduleImpactDays} day${co.scheduleImpactDays === 1 ? "" : "s"}`}
            />
            <Field label="Requested at" value={co.requestedAt} />
          </div>
          <p className="text-[11px] text-ink-tertiary mt-2">
            Negative impact = downgrade (saves money / shortens timeline). Both
            directions still flow through the same approval workflow.
          </p>
        </Card>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Scope</div>
        <Card padding="default">
          <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
            {co.scopeChangeDescription}
          </p>
        </Card>
      </div>

      {co.approvedBy && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Approval</div>
          <Card padding="default">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Approved by" value={co.approvedBy.slice(0, 8)} mono />
              <Field
                label="Approved at"
                value={
                  co.approvedAt ? new Date(co.approvedAt).toLocaleString() : "—"
                }
              />
            </div>
            {co.approvalNotes && (
              <p className="text-sm text-ink-secondary whitespace-pre-wrap mt-3">
                {co.approvalNotes}
              </p>
            )}
          </Card>
        </div>
      )}

      {co.rejectionReason && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Rejection</div>
          <Card padding="default">
            <p className="text-sm text-danger whitespace-pre-wrap">
              {co.rejectionReason}
            </p>
          </Card>
        </div>
      )}
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
      <div className={`mt-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
