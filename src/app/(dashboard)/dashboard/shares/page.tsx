import Link from "next/link";
import { SectionHeading } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { listOwners, listOwnershipShares } from "@/features/owners/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { computeShareTotals } from "@/features/shares/totals";
import { OwnersRowActions } from "@/components/dashboard/owners/owners-row-actions";
import { ShareAddButton } from "@/components/shares/share-add-button";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Ownership shares" };
export const dynamic = "force-dynamic";

export default async function SharesPage() {
  const [shares, owners, projects, villas] = await Promise.all([
    listOwnershipShares(),
    listOwners(),
    listProjects(),
    listVillas(),
  ]);
  const totals = computeShareTotals(shares);
  const issues = totals.filter((t) => t.exceedsHundred || t.underAllocated);
  const source = shares[0]?.source ?? "mock";
  const ownerOpts = owners.map((o) => ({ id: o.id, label: o.displayName }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Portfolio · ownership shares"
        title="Ownership shares"
        subtitle="Active and scheduled allocations across villas and pools. Active shares per villa or per project pool must total 100%."
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
            <ShareAddButton owners={ownerOpts} projects={projectOpts} villas={villaOpts} />
          </div>
        }
      />

      <DbStatusNotice />

      {/* Totals & warnings */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-label">Allocation totals</span>
          <span className="text-xs text-ink-tertiary">
            {totals.length} villa/pool groups · {issues.length} need review
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {totals.length === 0 && (
            <div className="text-sm text-ink-tertiary">No active shares yet.</div>
          )}
          {totals.map((t) => {
            const tone = t.exceedsHundred ? "danger" : t.underAllocated ? "warning" : "success";
            const message = t.exceedsHundred
              ? "Exceeds 100% — needs review"
              : t.underAllocated
                ? "Under-allocated — owner missing?"
                : "Fully allocated";
            return (
              <div
                key={`${t.scope}:${t.scopeId}`}
                className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-ink truncate">{t.scopeLabel}</div>
                  <Badge tone={tone}>
                    {tone === "success" ? (
                      <ShieldCheck className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {t.totalPercent.toFixed(2)}%
                  </Badge>
                </div>
                <div className="text-[11px] text-ink-tertiary">{message}</div>
                <div className="text-[11px] text-ink-tertiary tabular-nums">
                  {t.shares} share{t.shares === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {shares.length === 0 ? (
        <NoItemsYet
          entityLabel="ownership shares"
          description="Allocate ownership across villas and pools. Active shares per villa or per project must total 100%."
          addHref="/dashboard/shares/new"
          addLabel="New share"
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Owner</TH>
              <TH>Subject</TH>
              <TH>Model</TH>
              <TH>Effective from</TH>
              <TH>Status</TH>
              <TH className="text-right">Share %</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {shares.map((s) => (
              <TR key={s.id}>
                <TD>
                  <Link
                    href={`/dashboard/owners/${s.ownerId}`}
                    className="text-ink font-medium hover:text-accent"
                  >
                    {s.ownerName}
                  </Link>
                </TD>
                <TD className="text-ink-secondary">
                  {s.villaCode ? `Villa · ${s.villaCode}` : `Pool · ${s.projectName ?? "—"}`}
                </TD>
                <TD>
                  <Badge tone="outline">{s.model}</Badge>
                </TD>
                <TD className="text-ink-secondary text-sm">{s.startsOn}</TD>
                <TD>
                  <Badge tone={s.status === "active" ? "success" : "neutral"}>
                    {s.status}
                  </Badge>
                </TD>
                <TDNum>{s.sharePercent.toFixed(2)}%</TDNum>
                <TD className="text-right">
                  <OwnersRowActions
                    kind="share"
                    row={{
                      id: s.id,
                      displayName: `${s.ownerName} · ${s.villaCode ?? s.projectName ?? "—"}`,
                      values: {
                        ownerId: s.ownerId,
                        villaId: s.villaId ?? "",
                        projectId: s.projectId ?? "",
                        sharePercent: s.sharePercent,
                        model: s.model,
                        startsOn: s.startsOn,
                        endsOn: s.endsOn ?? "",
                        status: s.status,
                      },
                    }}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
