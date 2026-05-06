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
import { getChangeOrderByCode } from "@/lib/development/server/change-orders/change-order-queries";

export const metadata: Metadata = { title: "Change order · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  requested: "warning",
  under_review: "info",
  approved: "info",
  in_progress: "info",
  completed: "success",
  rejected: "danger",
  cancelled: "neutral",
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
        <PageHeader title="Change order" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const co = await getChangeOrderByCode(decodeURIComponent(code));
  if (!co) notFound();

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          {
            label: "Change orders",
            href: `/development-os/projects/${slug}/change-orders`,
          },
          { label: co.changeOrderCode },
        ]}
        eyebrow={`${co.status} · initiated by ${co.initiatedByType}`}
        title={co.title}
        description={co.reason}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/change-orders`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Status" title="Lifecycle">
        <Badge tone={STATUS_TONE[co.status] ?? "neutral"}>{co.status}</Badge>
        {co.requiredApprovalRole && (
          <p className="text-xs text-ink-tertiary mt-2">
            Required approval role: {co.requiredApprovalRole}
          </p>
        )}
      </Section>

      <Section eyebrow="Impact" title="Cost + schedule">
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
      </Section>

      <Section eyebrow="Scope" title="What changes">
        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
          {co.scopeChangeDescription}
        </p>
      </Section>

      {co.approvedBy && (
        <Section eyebrow="Approval" title="Approved by + when">
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
        </Section>
      )}

      {co.rejectionReason && (
        <Section eyebrow="Rejection" title="Why">
          <p className="text-sm text-danger whitespace-pre-wrap">
            {co.rejectionReason}
          </p>
        </Section>
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
