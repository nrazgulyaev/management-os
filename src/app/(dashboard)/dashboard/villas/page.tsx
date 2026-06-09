import Link from "next/link";
import { SectionHeading, Card, Kpi } from "@/components/dashboard/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Filter } from "lucide-react";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { VillaRowActions } from "@/components/villas/villa-row-actions";
import { VillaAddButton } from "@/components/villas/villa-add-button";

export const metadata = { title: "Villas" };
export const dynamic = "force-dynamic";

const BOOKABLE = new Set(["available", "occupied", "ready", "owner_stay"]);
const OUT_OF_SERVICE = new Set(["maintenance_blocked", "out_of_service", "archived"]);

export default async function VillasPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  const source = villas[0]?.source ?? "mock";
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  const projectCount = new Set(villas.map((v) => v.projectName)).size;
  const activeCount = villas.filter((v) => BOOKABLE.has(v.status)).length;
  const outOfServiceCount = villas.filter((v) => OUT_OF_SERVICE.has(v.status)).length;
  const rates = villas
    .map((v) => v.currentNightlyRateUsd)
    .filter((r): r is number => r !== null && r > 0);
  const avgNightly = rates.length
    ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
    : null;

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Portfolio · villas"
        title={
          <>
            Every <em>villa</em> we run.
          </>
        }
        subtitle="Status mirrors the operations board. Nightly rate reflects the active dynamic-pricing curve; owner-visible flags gate what each owner sees."
        actions={<SourceBadge source={source} />}
      />

      <DbStatusNotice />

      <section className="flex flex-col gap-[22px]">
        <div className="pf-kpis">
          <Kpi label="Total villas" value={villas.length} sub={`across ${projectCount} projects`} />
          <Kpi tone="success" label="Active" value={activeCount} sub="bookable" />
          <Kpi
            tone="gold"
            label="Avg nightly"
            value={avgNightly !== null ? `$${avgNightly.toLocaleString()}` : "—"}
            sub="portfolio mean"
          />
          <Kpi tone="warn" label="Out of service" value={outOfServiceCount} sub="maintenance · reno" />
        </div>

        <Card padding="lg">
          <div className="pf-card-h">
            <h3>All villas · {villas.length}</h3>
            <span className="meta">SOURCE · LIVE</span>
            <Button variant="secondary" size="sm">
              <Filter className="w-4 h-4" strokeWidth={1.75} />
              Filter
            </Button>
            <VillaAddButton projects={projectOptions} />
          </div>

          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Villa</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Model</th>
                  <th className="num">Beds</th>
                  <th className="num">Nightly · USD</th>
                  <th>Owner-visible</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {villas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-ink-tertiary py-8">
                      No villas yet.
                    </td>
                  </tr>
                ) : (
                  villas.map((v) => (
                    <tr key={v.id}>
                      <td className="row-title">
                        <Link
                          href={`/dashboard/villas/${v.id}`}
                          className="hover:text-accent transition-colors"
                        >
                          {v.name ?? v.unitCode}
                        </Link>
                        <div className="mono text-[11px] text-ink-tertiary">{v.unitCode}</div>
                      </td>
                      <td className="text-ink-secondary">{v.projectName}</td>
                      <td>
                        <StatusPill status={v.status} />
                      </td>
                      <td>
                        <Badge tone="outline">{v.managementModel}</Badge>
                      </td>
                      <td className="num">{v.bedrooms}</td>
                      <td className="num">
                        {v.currentNightlyRateUsd !== null
                          ? `$${v.currentNightlyRateUsd.toLocaleString()}`
                          : "—"}
                      </td>
                      <td>
                        {v.ownerVisible ? (
                          <Badge tone="success">Visible</Badge>
                        ) : (
                          <Badge tone="neutral">Hidden</Badge>
                        )}
                      </td>
                      <td className="text-right">
                        <VillaRowActions villa={v} projects={projectOptions} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
