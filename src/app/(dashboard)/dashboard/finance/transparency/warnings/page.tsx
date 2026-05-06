import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listStatementReconciliationWarnings } from "@/features/statement-transparency/services";
import {
  AcknowledgeWarningButton,
  DismissWarningButton,
  ResolveWarningButton,
} from "@/components/finance/transparency-buttons";

export const metadata = { title: "Statement reconciliation warnings" };
export const dynamic = "force-dynamic";

const SEVERITY_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "danger"
> = {
  info: "info",
  warning: "warning",
  critical: "danger",
};

export default async function TransparencyWarningsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: "open" | "acknowledged" | "resolved" | "dismissed";
    severity?: "info" | "warning" | "critical";
  }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const severity = sp.severity;
  const warnings = await listStatementReconciliationWarnings(null, {
    status,
    severity,
  });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Transparency", href: "/dashboard/finance/transparency" },
          { label: "Warnings" },
        ]}
        title="Reconciliation warnings"
        description="Filter, acknowledge, resolve, or dismiss warnings raised by the transparency rebuild."
      />
      <div className="flex flex-wrap gap-2">
        {(["open", "acknowledged", "resolved", "dismissed"] as const).map((s) => (
          <Link
            key={s}
            href={`/dashboard/finance/transparency/warnings?status=${s}${severity ? `&severity=${severity}` : ""}`}
            className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
              status === s
                ? "bg-ink text-ink-inverse"
                : "border border-line-soft text-ink-secondary hover:border-line-strong"
            }`}
          >
            {s}
          </Link>
        ))}
        <span className="mx-2 text-ink-tertiary">·</span>
        {(["info", "warning", "critical"] as const).map((s) => (
          <Link
            key={s}
            href={`/dashboard/finance/transparency/warnings?status=${status}&severity=${s}`}
            className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
              severity === s
                ? "bg-ink text-ink-inverse"
                : "border border-line-soft text-ink-secondary hover:border-line-strong"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>
      <Section
        eyebrow="Warnings"
        title={`${warnings.length} ${status} warning${warnings.length === 1 ? "" : "s"}`}
      >
        {warnings.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-sm text-ink-tertiary">
            No warnings match these filters.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Statement</th>
                  <th className="px-4 py-3">Detected</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {warnings.map((w) => (
                  <tr key={w.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 text-xs">
                      {w.warningType.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={SEVERITY_TONES[w.severity] ?? "neutral"}>
                        {w.severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">{w.internalTitle}</td>
                    <td className="px-4 py-3 text-[11px] font-mono text-ink-tertiary">
                      {w.sourceTable ?? "—"}
                      {w.sourceId
                        ? ` · ${w.sourceId.slice(0, 8)}…`
                        : ""}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {w.ownerStatementId ? (
                        <Link
                          href={`/dashboard/finance/transparency/statements/${w.ownerStatementId}`}
                          className="text-ink hover:underline underline-offset-4"
                        >
                          Open →
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                      {w.detectedAt instanceof Date
                        ? w.detectedAt.toISOString().slice(0, 16).replace("T", " ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 flex items-center gap-1">
                      {w.status === "open" && (
                        <>
                          <AcknowledgeWarningButton warningId={w.id} />
                          <ResolveWarningButton warningId={w.id} />
                          <DismissWarningButton warningId={w.id} />
                        </>
                      )}
                      {w.status === "acknowledged" && (
                        <ResolveWarningButton warningId={w.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
