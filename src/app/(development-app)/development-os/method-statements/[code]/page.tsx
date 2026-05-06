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
import { getMethodStatementByCode } from "@/lib/development/server/method-statements/method-statement-queries";

export const metadata: Metadata = {
  title: "Method statement · Development OS",
};
export const dynamic = "force-dynamic";

interface ProcedureStep {
  step: number;
  instruction: string;
  duration?: string;
}

interface QualityCheckpoint {
  checkpoint: string;
  tolerance?: string;
}

export default async function MethodStatementDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Method statement" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const m = await getMethodStatementByCode(decodeURIComponent(code));
  if (!m) notFound();

  const steps = (m.procedureSteps as ProcedureStep[] | null) ?? [];
  const checkpoints = (m.qualityCheckpoints as QualityCheckpoint[] | null) ?? [];

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Method statements", href: "/development-os/method-statements" },
          { label: m.methodCode },
        ]}
        eyebrow={`${m.category} · v${m.versionNumber} · ${m.status}`}
        title={m.title}
        description={m.description ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/method-statements">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All SOPs
            </Link>
          </Button>
        }
      />

      <Section
        eyebrow="Procedure"
        title={`${steps.length} step${steps.length === 1 ? "" : "s"}`}
      >
        {steps.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No procedure steps recorded.</p>
        ) : (
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li
                key={i}
                className="flex gap-3 rounded border border-line-soft p-3"
              >
                <span className="text-sm font-mono font-medium shrink-0">
                  {s.step}.
                </span>
                <div className="flex-1">
                  <p className="text-sm">{s.instruction}</p>
                  {s.duration && (
                    <p className="text-[11px] text-ink-tertiary mt-1">
                      ⏱ {s.duration}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {checkpoints.length > 0 && (
        <Section
          eyebrow="Quality"
          title={`${checkpoints.length} checkpoint${checkpoints.length === 1 ? "" : "s"}`}
        >
          <ul className="space-y-2">
            {checkpoints.map((c, i) => (
              <li
                key={i}
                className="rounded border border-line-soft p-3 text-sm flex justify-between gap-4"
              >
                <span>{c.checkpoint}</span>
                {c.tolerance && (
                  <span className="text-ink-tertiary font-mono text-xs">
                    {c.tolerance}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section eyebrow="Resources" title="Tools, materials, PPE">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ResourceList label="Required tools" items={m.requiredTools} />
          <ResourceList label="Required materials" items={m.requiredMaterials} />
          <ResourceList label="Required PPE" items={m.requiredPpe} />
        </div>
      </Section>

      {m.safetyHazards && m.safetyHazards.length > 0 && (
        <Section eyebrow="Safety" title="Hazards + mitigations">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ResourceList label="Hazards" items={m.safetyHazards} />
            <ResourceList label="Mitigations" items={m.hazardMitigations} />
          </div>
        </Section>
      )}

      <Section eyebrow="Lifecycle" title="Approval + supersession">
        <div className="flex items-center gap-2 mb-3">
          <Badge tone={m.status === "active" ? "success" : "info"}>
            {m.status}
          </Badge>
          <span className="text-xs text-ink-tertiary">
            v{m.versionNumber}
            {m.effectiveFrom && ` · effective ${m.effectiveFrom}`}
            {m.effectiveUntil && ` → ${m.effectiveUntil}`}
          </span>
        </div>
      </Section>
    </DevelopmentShell>
  );
}

function ResourceList({
  label,
  items,
}: {
  label: string;
  items: string[] | null;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-1">
        {label}
      </div>
      {!items || items.length === 0 ? (
        <p className="text-xs text-ink-tertiary">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-xs">
              • {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
