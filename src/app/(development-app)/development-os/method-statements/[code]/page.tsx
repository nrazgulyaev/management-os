import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getMethodStatementByCode } from "@/lib/development/server/method-statements/method-statement-queries";
import { MethodStatementStatusActions } from "./_status-actions";

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
        <div className="page-header">
          <div className="left">
            <h1>Method statement</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/method-statements">Method statements</Link> /{" "}
            <span>{m.methodCode}</span>
          </div>
          <h1>{m.title}</h1>
          <p className="text-[13px] text-ink-3 mt-1">
            {m.category} · v{m.versionNumber} · {m.status}
          </p>
          {m.description && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {m.description}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href="/development-os/method-statements"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All SOPs
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Procedure</div>
        <Card padding="default">
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
        </Card>
      </div>

      {checkpoints.length > 0 && (
        <div>
          <div className="label mb-2.5">Quality</div>
          <Card padding="default">
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
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Resources</div>
        <Card padding="default">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ResourceList label="Required tools" items={m.requiredTools} />
            <ResourceList label="Required materials" items={m.requiredMaterials} />
            <ResourceList label="Required PPE" items={m.requiredPpe} />
          </div>
        </Card>
      </div>

      {m.safetyHazards && m.safetyHazards.length > 0 && (
        <div>
          <div className="label mb-2.5">Safety</div>
          <Card padding="default">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ResourceList label="Hazards" items={m.safetyHazards} />
              <ResourceList label="Mitigations" items={m.hazardMitigations} />
            </div>
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Lifecycle</div>
        <Card padding="default">
          <div className="flex items-center gap-2">
            <HandoffBadge tone={m.status === "active" ? "ok" : "info"}>
              {m.status}
            </HandoffBadge>
            <span className="text-xs text-ink-tertiary">
              v{m.versionNumber}
              {m.effectiveFrom && ` · effective ${m.effectiveFrom}`}
              {m.effectiveUntil && ` → ${m.effectiveUntil}`}
            </span>
          </div>
          <div className="mt-3">
            <MethodStatementStatusActions methodId={m.id} status={m.status} />
          </div>
        </Card>
      </div>
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
