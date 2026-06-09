import type { Metadata } from "next";
import Link from "next/link";
import { Ruler } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listBoqDocuments } from "@/lib/development/server/boq/boq-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { projects } from "@/lib/db/schema/projects";
import { NoItemsYet } from "@/components/ui/primitives";
import { AddBoqButton } from "@/components/development/boq/boq-add-buttons";

export const metadata: Metadata = { title: "BOQ · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "ink" | undefined
> = {
  draft: undefined,
  under_review: "info",
  approved: "ok",
  tender: "info",
  awarded: "ok",
  superseded: undefined,
  archived: undefined,
};

/** IDR-style major-unit formatting from a BIGINT minor amount. */
function fmtMajor(minor: bigint | number | null): string {
  if (minor == null) return "—";
  return Math.round(Number(minor) / 100).toLocaleString("en-US");
}
/** Compact M-suffixed major-unit value for the KPI strip. */
function fmtCompact(minor: number): string {
  const major = minor / 100;
  if (major >= 1e9) return `${(major / 1e9).toFixed(1)}B`;
  if (major >= 1e6) return `${(major / 1e6).toFixed(1)}M`;
  if (major >= 1e3) return `${(major / 1e3).toFixed(0)}k`;
  return `${Math.round(major)}`;
}

export default async function BoqListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Construction · estimate</div>
            <h1>Bill of Quantities</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const docs = await safeQuery("listBoqDocuments", listBoqDocuments(), [], 4000);
  const projectRows = await safeQuery(
    "boqListProjects",
    db.select({ id: projects.id, name: projects.name }).from(projects),
    [] as Array<{ id: string; name: string }>,
    4000,
  );

  // KPI strip — computed from the documents already fetched (no new read).
  const totalEstimateMinor = docs.reduce(
    (n, d) => n + (d.totalAmountMinor != null ? Number(d.totalAmountMinor) : 0),
    0,
  );
  const approvedCount = docs.filter(
    (d) => d.status === "approved" || d.status === "awarded",
  ).length;
  const currencies = Array.from(new Set(docs.map((d) => d.currency))).filter(
    Boolean,
  );
  const headlineCurrency = currencies[0] ?? "IDR";

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Construction · estimate</div>
          <h1>Bill of Quantities</h1>
        </div>
        <div className="actions">
          <AddBoqButton projects={projectRows} variant="accent" />
          <Link
            href="/development-os/boq/takeoff"
            className="btn btn-dark btn-sm"
          >
            <Ruler className="w-4 h-4" strokeWidth={1.75} />
            Drawing takeoff
          </Link>
          <Link href="/development-os/boq/quick-entry" className="btn btn-dark btn-sm">
            Quick entry
          </Link>
        </div>
      </header>

      <p className="text-ink-secondary text-sm max-w-3xl -mt-4 leading-relaxed">
        Hierarchical line-item documents per project/villa with version history.
        Line totals are DB-computed (GENERATED STORED); section subtotals +
        document totals recompute atomically when items change.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Estimate value"
          value={docs.length ? fmtCompact(totalEstimateMinor) : "—"}
          sub={`${headlineCurrency} · across documents`}
          tone={docs.length ? "accent" : undefined}
        />
        <Kpi
          label="Documents"
          value={docs.length || "—"}
          sub="in catalog"
        />
        <Kpi
          label="Approved"
          value={approvedCount || "—"}
          sub="approved + awarded"
          tone={approvedCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Currencies"
          value={currencies.length || "—"}
          sub={currencies.join(" · ") || "none yet"}
        />
      </div>

      {docs.length === 0 ? (
        <NoItemsYet
          entityLabel="BOQ documents"
          description="Create the first BOQ for a project — sections + line items can be CSV-imported on the detail page once the document exists."
          addAction={<AddBoqButton projects={projectRows} />}
        />
      ) : (
        <section>
          <div className="boq-cat-head">
            <span className="label">All BOQ documents</span>
            <span className="sum">
              {fmtMajor(totalEstimateMinor)} {headlineCurrency}
            </span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="boq-est">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Project</th>
                    <th>Villa</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td className="code">
                        <Link
                          href={`/development-os/boq/${encodeURIComponent(d.boqCode)}`}
                          className="hover:underline"
                        >
                          {d.boqCode}
                        </Link>
                      </td>
                      <td className="desc">{d.title}</td>
                      <td className="code">{d.projectId.slice(0, 8)}</td>
                      <td className="code">{d.villaId?.slice(0, 8) ?? "—"}</td>
                      <td className="unit">{d.versionLabel}</td>
                      <td>
                        <HandoffBadge tone={STATUS_TONE[d.status] ?? undefined}>
                          {d.status}
                        </HandoffBadge>
                      </td>
                      <td className="num amount">
                        {d.totalAmountMinor != null
                          ? `${fmtMajor(d.totalAmountMinor)} ${d.currency}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </DevelopmentShell>
  );
}
