import type { Metadata } from "next";
import Link from "next/link";
import { Card, Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listDrawings } from "@/lib/development/server/drawings/drawing-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { projects } from "@/lib/db/schema/projects";
import { NoItemsYet } from "@/components/ui/primitives";
import { AddDrawingButton } from "@/components/development/drawings/drawings-add-buttons";

export const metadata: Metadata = { title: "Drawings · Development OS" };
export const dynamic = "force-dynamic";

export default async function DrawingsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery("listDrawings", listDrawings(), [], 4000);
  const projectRows = await safeQuery(
    "drawingsListProjects",
    db.select({ id: projects.id, name: projects.name }).from(projects),
    [] as Array<{ id: string; name: string }>,
    4000,
  );
  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));

  const disciplines = new Set(rows.map((d) => d.drawingType)).size;
  const phaseCount = (needle: string) =>
    rows.filter((d) =>
      (d.drawingPhase ?? "").toLowerCase().includes(needle),
    ).length;
  const inConstruction = phaseCount("construct");
  const inDesign = phaseCount("design");

  return (
    <DevelopmentShell>
      <div className="flex items-end gap-[18px]">
        <div className="flex-1 min-w-0">
          <div className="label text-amber">Knowledge · revision control</div>
          <h1 className="display text-[42px] mt-1.5 mb-0 font-medium">
            Drawings &amp; <em>revisions</em>.
          </h1>
          <p className="mt-2.5 mb-0 text-[15px] leading-[1.55] text-ink-3 max-w-[680px]">
            Each drawing carries multiple revisions (Rev A, B, …). At most one
            revision per drawing is <em>issued-for-construction</em> at any time
            — enforced at the database.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AddDrawingButton projects={projectRows} />
          <Link
            href="/development-os/knowledge"
            className="btn btn-dark btn-sm"
          >
            Knowledge base
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <NoItemsYet
          entityLabel="drawings"
          description="Each drawing carries metadata + a revision stream. Add the first drawing here, then upload Rev A on the detail page."
          addAction={<AddDrawingButton projects={projectRows} />}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              label="Drawings"
              value={String(rows.length)}
              sub={`${disciplines} discipline${disciplines === 1 ? "" : "s"}`}
            />
            <Kpi
              label="In construction"
              value={String(inConstruction)}
              sub="current phase"
              tone="success"
            />
            <Kpi
              label="In design dev"
              value={String(inDesign)}
              sub="pre-construction"
              tone="warn"
            />
            <Kpi
              label="Disciplines"
              value={String(disciplines)}
              sub="drawing types"
            />
          </div>

          <Card padding="none" overflowHidden>
            <div className="px-[22px] py-3.5 border-b border-line flex items-center">
              <h3 className="display text-[19px] font-medium m-0">
                All drawings
              </h3>
              <span className="mono ml-auto text-[11px] text-ink-3">
                {rows.length} · CATALOG
              </span>
            </div>
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Number</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Phase</th>
                  <th>Project</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="mono text-[11px]">
                      <Link
                        href={`/development-os/drawings/${encodeURIComponent(d.drawingCode)}`}
                        className="no-underline text-inherit hover:underline"
                      >
                        {d.drawingCode}
                      </Link>
                    </td>
                    <td className="mono text-[11px]">{d.drawingNumber}</td>
                    <td>{d.title}</td>
                    <td>
                      <HandoffBadge>{d.drawingType}</HandoffBadge>
                    </td>
                    <td className="text-ink-3">{d.drawingPhase ?? "—"}</td>
                    <td className="mono text-[11px] text-ink-3">
                      {projectName.get(d.projectId) ??
                        d.projectId.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </DevelopmentShell>
  );
}
