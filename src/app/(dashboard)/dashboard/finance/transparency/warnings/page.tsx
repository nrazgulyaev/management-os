import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
  "info" | "warn" | "danger" | "soft"
> = {
  info: "info",
  warning: "warn",
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/transparency">Transparency</Link> /{" "}
            <span>Warnings</span>
          </div>
          <h1>Reconciliation warnings</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Filter, acknowledge, resolve, or dismiss warnings raised by the
            transparency rebuild.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["open", "acknowledged", "resolved", "dismissed"] as const).map((s) => (
          <Link
            key={s}
            href={`/dashboard/finance/transparency/warnings?status=${s}${severity ? `&severity=${severity}` : ""}`}
            className={`btn btn-sm ${status === s ? "btn-accent" : "btn-secondary"}`}
          >
            {s}
          </Link>
        ))}
        <span className="mx-2 text-ink-3">·</span>
        {(["info", "warning", "critical"] as const).map((s) => (
          <Link
            key={s}
            href={`/dashboard/finance/transparency/warnings?status=${status}&severity=${s}`}
            className={`btn btn-sm ${severity === s ? "btn-accent" : "btn-secondary"}`}
          >
            {s}
          </Link>
        ))}
      </div>
      <div>
        <div className="label mb-2.5">{`Warnings · ${warnings.length} ${status} warning${warnings.length === 1 ? "" : "s"}`}</div>
        {warnings.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-sm text-ink-tertiary">
            No warnings match these filters.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Severity</th>
                <th scope="col">Title</th>
                <th scope="col">Source</th>
                <th scope="col">Statement</th>
                <th scope="col">Detected</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {warnings.map((w) => (
                <tr key={w.id}>
                  <td className="text-[12px]">
                    {w.warningType.replace(/_/g, " ")}
                  </td>
                  <td>
                    <HandoffBadge tone={SEVERITY_TONES[w.severity] ?? "soft"}>
                      {w.severity}
                    </HandoffBadge>
                  </td>
                  <td className="text-[12px]">{w.internalTitle}</td>
                  <td className="text-[11px] mono text-ink-3">
                    {w.sourceTable ?? "—"}
                    {w.sourceId ? ` · ${w.sourceId.slice(0, 8)}…` : ""}
                  </td>
                  <td className="text-[12px]">
                    {w.ownerStatementId ? (
                      <Link
                        href={`/dashboard/finance/transparency/statements/${w.ownerStatementId}`}
                        className="text-ink hover:text-terra"
                      >
                        Open →
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-[11px] text-ink-3">
                    {w.detectedAt instanceof Date
                      ? w.detectedAt.toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </td>
                  <td className="flex items-center gap-1">
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
        )}
      </div>
    </div>
  );
}
