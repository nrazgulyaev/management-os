import Link from "next/link";
import { SectionHeading, Card, Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listOwners, listOwnershipShares } from "@/features/owners/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { computeShareTotals } from "@/features/shares/totals";
import { OwnersRowActions } from "@/components/dashboard/owners/owners-row-actions";
import { ShareAddButton } from "@/components/shares/share-add-button";
import { NoItemsYet } from "@/components/ui/primitives";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Ownership shares" };
export const dynamic = "force-dynamic";

export default async function SharesPage() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Ownership shares" />;
  const [shares, owners, projects, villas] = await Promise.all([
    listOwnershipShares(),
    listOwners(),
    listProjects(),
    listVillas(),
  ]);
  const totals = computeShareTotals(shares);
  const issues = totals.filter((t) => t.exceedsHundred || t.underAllocated);
  const fullyAllocated = totals.filter((t) => !t.exceedsHundred && !t.underAllocated).length;
  const overCount = totals.filter((t) => t.exceedsHundred).length;
  const underCount = totals.filter((t) => t.underAllocated).length;
  const source = shares[0]?.source ?? "mock";
  const ownerOpts = owners.map((o) => ({ id: o.id, label: o.displayName }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Portfolio · ownership shares"
        title={
          <>
            Allocations to <em>100%</em>.
          </>
        }
        subtitle="Active shares per villa or per project pool must total exactly 100%. Anything over- or under-allocated is flagged before it reaches an owner statement."
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
            <ShareAddButton owners={ownerOpts} projects={projectOpts} villas={villaOpts} />
          </div>
        }
      />

      <DbStatusNotice />

      <section className="flex flex-col gap-[22px]">
        <div className="pf-kpis">
          <Kpi label="Share groups" value={totals.length} sub="villas + pools" />
          <Kpi tone="success" label="Fully allocated" value={fullyAllocated} sub="= 100%" />
          <Kpi tone="danger" label="Over 100%" value={overCount} sub="needs review" />
          <Kpi tone="warn" label="Under-allocated" value={underCount} sub="owner missing?" />
        </div>

        {issues.length > 0 && (
          <div className="flex flex-col gap-[18px]">
            <div className="pf-card-h">
              <h3 className="!text-[16px]">Groups needing review</h3>
              <span className="meta">
                {issues.length} OF {totals.length}
              </span>
            </div>
            <div className="pf-alloc">
              {issues.map((t) => {
                const variant = t.exceedsHundred ? "bad" : "warn";
                const width = Math.min(100, t.totalPercent);
                const message = t.exceedsHundred
                  ? "Exceeds 100% — needs review"
                  : "Under-allocated — owner missing?";
                return (
                  <div key={`${t.scope}:${t.scopeId}`} className={`pf-acard ${variant}`}>
                    <div className="top">
                      <span className="sub">{t.scopeLabel}</span>
                      <span className="pct">{t.totalPercent.toFixed(1)}%</span>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${width}%` }} />
                    </div>
                    <div className="msg">{message}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Card padding="lg">
          <div className="pf-card-h">
            <h3>All allocations</h3>
            <span className="meta">ACTIVE + SCHEDULED</span>
          </div>

          {shares.length === 0 ? (
            <NoItemsYet
              entityLabel="ownership shares"
              description="Allocate ownership across villas and pools. Active shares per villa or per project must total 100%."
              addHref="/dashboard/shares/new"
              addLabel="New share"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Subject</th>
                    <th>Model</th>
                    <th>Effective</th>
                    <th>Status</th>
                    <th className="num">Share %</th>
                    <th className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {shares.map((s) => (
                    <tr key={s.id}>
                      <td className="row-title">
                        <Link
                          href={`/dashboard/owners/${s.ownerId}`}
                          className="hover:text-accent transition-colors"
                        >
                          {s.ownerName}
                        </Link>
                      </td>
                      <td className="text-ink-secondary">
                        {s.villaCode ? `Villa · ${s.villaCode}` : `Pool · ${s.projectName ?? "—"}`}
                      </td>
                      <td>
                        <Badge tone="outline">{s.model}</Badge>
                      </td>
                      <td className="mono text-[12px] text-ink-secondary">{s.startsOn}</td>
                      <td>
                        <Badge tone={s.status === "active" ? "success" : "neutral"}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="num">{s.sharePercent.toFixed(2)}%</td>
                      <td className="text-right">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
