import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getProjectDecisionByCode } from "@/lib/development/server/decisions/decision-queries";
import { DecisionLifecycleControls } from "./_controls";

export const metadata: Metadata = { title: "Decision · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "soft"> = {
  draft: "soft",
  active: "ok",
  superseded: "soft",
  reversed: "warn",
};

export default async function DecisionDetailPage({
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
            <h1>Decision</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const decision = await getProjectDecisionByCode(decodeURIComponent(code));
  if (!decision) notFound();

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/decisions`}>
              Decisions
            </Link>{" "}
            / <span>{decision.decisionCode}</span>
          </div>
          <h1>{decision.title}</h1>
          {decision.context && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {decision.context}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/decisions`}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Decisions
          </Link>
        </div>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Decision</div>
        <Card padding="default">
          <HandoffBadge tone={STATUS_TONE[decision.status] ?? "soft"}>
            {decision.status}
          </HandoffBadge>
          <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed mt-3">
            {decision.decisionText}
          </p>
        </Card>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Lifecycle</div>
        <Card padding="default">
          <DecisionLifecycleControls
            decisionId={decision.id}
            projectId={decision.projectId}
            slug={slug}
            code={decodeURIComponent(code)}
            status={decision.status}
          />
        </Card>
      </div>

      {decision.rationale && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Rationale</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
              {decision.rationale}
            </p>
          </Card>
        </div>
      )}

      {decision.context && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Context</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
              {decision.context}
            </p>
          </Card>
        </div>
      )}

      <div className="mt-[18px]">
        <div className="label mb-2.5">Audit</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Decided by" value={decision.decidedBy.slice(0, 8)} mono />
          <Field
            label="Approved by"
            value={decision.approvedBy?.slice(0, 8) ?? "—"}
            mono
          />
          <Field label="Decision date" value={decision.decisionDate} />
          <Field label="Approval date" value={decision.approvalDate ?? "—"} />
          <Field
            label="Supplier"
            value={decision.relatedSupplierId?.slice(0, 8) ?? "—"}
            mono
          />
          <Field
            label="Superseded by"
            value={decision.supersededBy?.slice(0, 8) ?? "—"}
            mono
          />
          </div>
        </Card>
      </div>

      {decision.tags && decision.tags.length > 0 && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Tags</div>
          <Card padding="default">
            <div className="flex flex-wrap gap-1">
              {decision.tags.map((t) => (
                <HandoffBadge key={t} tone="soft">
                  {t}
                </HandoffBadge>
              ))}
            </div>
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
