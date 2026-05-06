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
import { getProjectDecisionByCode } from "@/lib/development/server/decisions/decision-queries";

export const metadata: Metadata = { title: "Decision · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  draft: "neutral",
  active: "success",
  superseded: "neutral",
  reversed: "warning",
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
        <PageHeader title="Decision" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const decision = await getProjectDecisionByCode(decodeURIComponent(code));
  if (!decision) notFound();

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Decisions", href: `/development-os/projects/${slug}/decisions` },
          { label: decision.decisionCode },
        ]}
        eyebrow={`${decision.status}${decision.category ? ` · ${decision.category}` : ""}`}
        title={decision.title}
        description={decision.context ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/decisions`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Decisions
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Decision" title="What was decided">
        <Badge tone={STATUS_TONE[decision.status] ?? "neutral"}>
          {decision.status}
        </Badge>
        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed mt-3">
          {decision.decisionText}
        </p>
      </Section>

      {decision.rationale && (
        <Section eyebrow="Rationale" title="Why">
          <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
            {decision.rationale}
          </p>
        </Section>
      )}

      {decision.context && (
        <Section eyebrow="Context" title="Background">
          <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
            {decision.context}
          </p>
        </Section>
      )}

      <Section eyebrow="Audit" title="Who + when">
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
      </Section>

      {decision.tags && decision.tags.length > 0 && (
        <Section eyebrow="Tags" title="Categorization">
          <div className="flex flex-wrap gap-1">
            {decision.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
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
