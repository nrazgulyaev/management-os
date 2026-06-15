import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getPermit } from "@/lib/development/server/permits/permit-actions";

export const metadata: Metadata = { title: "Permit · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  planned: "soft",
  preparing: "info",
  submitted: "info",
  under_review: "info",
  approved: "ok",
  rejected: "danger",
  expired: "warn",
  renewed: "ok",
  cancelled: "soft",
};

export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Permit</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getPermit(id);
  if (!data) notFound();
  const { permit: p, documents } = data;

  // Build a status timeline from the lifecycle dates.
  const timeline: Array<{ label: string; date: string | null }> = [
    { label: "Preparation started", date: p.preparationStartedAt },
    { label: "Submitted", date: p.submittedAt },
    { label: "Target approval", date: p.targetApprovalDate },
    { label: "Received", date: p.receivedAt },
    { label: "Expires", date: p.expiresAt },
  ];

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/permits`}>Permits</Link> /{" "}
            <span>{p.permitLabel}</span>
          </div>
          <h1>{p.permitLabel}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {p.permitType} · {p.status}
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/permits`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All permits
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Header</div>
        <Card padding="default">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Status
              </div>
              <HandoffBadge tone={STATUS_TONE[p.status] ?? "soft"}>{p.status}</HandoffBadge>
            </div>
            <Field label="Number" value={p.permitNumber ?? "—"} mono />
            <Field label="Authority" value={p.issuingAuthority ?? "—"} />
            <Field
              label="Planned cost"
              value={
                p.plannedCostMinor != null
                  ? `${p.currency} ${(Number(p.plannedCostMinor) / 100).toFixed(2)}`
                  : "—"
              }
            />
            <Field
              label="Actual cost"
              value={
                p.actualCostMinor != null
                  ? `${p.currency} ${(Number(p.actualCostMinor) / 100).toFixed(2)}`
                  : "—"
              }
            />
            <Field label="Responsible" value={p.responsiblePerson ?? "—"} />
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Lifecycle</div>
        <Card padding="default">
          <ol className="border-l-2 border-line-soft ml-2 space-y-2">
            {timeline.map((t, i) => (
              <li key={i} className="ml-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full -ml-4 border-2 border-line-soft ${
                      t.date ? "bg-success" : "bg-muted"
                    }`}
                  />
                  <span className="text-sm">{t.label}</span>
                  {t.date && (
                    <span className="text-[11px] text-ink-tertiary">{t.date}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {p.notes && (
        <div>
          <div className="label mb-2.5">Notes</div>
          <Card padding="default">
            <p className="text-sm whitespace-pre-wrap">{p.notes}</p>
          </Card>
        </div>
      )}

      {p.rejectionReason && (
        <div>
          <div className="label mb-2.5">Rejected</div>
          <Card padding="default">
            <p className="text-sm text-danger whitespace-pre-wrap">
              {p.rejectionReason}
            </p>
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Documents · {documents.length} attached</div>
        <Card padding="default">
          {documents.length === 0 ? (
            <p className="text-sm text-ink-tertiary">
              No documents attached. Use the attachPermitDocument server action.
            </p>
          ) : (
            <ul className="text-xs space-y-1">
              {documents.map((d) => (
                <li key={d.id} className="font-mono">
                  {d.documentRole ?? "doc"} → {d.documentId}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
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
