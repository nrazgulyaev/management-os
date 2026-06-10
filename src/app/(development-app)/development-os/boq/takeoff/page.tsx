import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listBoqSectionTargets } from "@/lib/development/server/boq/boq-queries";
import {
  listTakeoffRevisionOptions,
  countStaleTakeoffs,
  type TakeoffRevisionOption,
} from "@/lib/development/server/boq/takeoff-queries";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import { DegradedState } from "@/components/ui/state";
import { TakeoffWorkbench } from "./_takeoff-workbench";

export const metadata: Metadata = { title: "Drawing takeoff · Development OS" };
export const dynamic = "force-dynamic";

/**
 * Estimator takeoff workbench — the сметчик's signature tool. Mounts the
 * existing DrawingViewer takeoff primitive (scale-calibrated on-drawing
 * area / length / count measurement, Bluebeam/CostX pattern) and turns
 * measured quantities into costed BOQ lines.
 *
 * Block 09 DEPTH: measurements now PERSIST against the drawing REVISION they
 * were taken on (migration 0140 takeoff_measurements). The full round-trip —
 * save → edit/delete/re-cost → push a revision into the BOQ → re-push the same
 * line in place — is wired, and a takeoff is flagged STALE when a newer
 * revision of its drawing lands.
 */
export default async function TakeoffPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Construction · estimate</div>
            <h1>Drawing takeoff</h1>
          </div>
        </header>
        <DegradedState
          kind="db"
          title="Takeoff workbench unavailable"
          message="The database is not configured in this environment, so persisted takeoffs and BOQ targets cannot load. Configure DATABASE_URL to use the workbench."
        />
      </DevelopmentShell>
    );
  }

  const orgId = await requireOrgId();
  const [boqTargets, revisionOptions, staleCount] = await Promise.all([
    safeQuery("boqSectionTargets", listBoqSectionTargets(), [], 4000),
    safeQuery(
      "takeoffRevisionOptions",
      listTakeoffRevisionOptions(orgId),
      [] as TakeoffRevisionOption[],
      4000,
    ),
    safeQuery("staleTakeoffCount", countStaleTakeoffs(orgId), 0, 4000),
  ]);

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/boq">BOQ</Link>
            <span>/</span>
            <span>Takeoff</span>
          </div>
          <h1>Drawing takeoff</h1>
        </div>
        <div className="actions">
          <Link href="/development-os/boq" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            BOQ
          </Link>
        </div>
      </header>

      <div>
        <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
          Estimator
        </div>
        <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-2">
          Measure a plan → cost the work
        </h2>
        <p className="text-sm text-ink-3 mb-4 max-w-2xl leading-relaxed">
          Pick the drawing revision you are measuring against, load its
          floor-plan or elevation, calibrate the scale once (two points a known
          distance apart), then draw area polygons, length polylines, or counts.
          Each measurement persists against that revision, costs to a BOQ line
          (quantity × rate), and can be edited, re-costed, or pushed into a BOQ
          section. A newer revision flags older takeoffs as stale.
        </p>
      </div>
      <TakeoffWorkbench
        boqTargets={boqTargets}
        revisionOptions={revisionOptions}
        staleCount={staleCount}
      />
    </DevelopmentShell>
  );
}
