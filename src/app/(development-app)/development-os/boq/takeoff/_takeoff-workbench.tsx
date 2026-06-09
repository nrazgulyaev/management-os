"use client";

/**
 * Estimator takeoff workbench (Block 09 ESTIMATOR — DEEPENED).
 *
 * Mounts the existing DrawingViewer takeoff primitive (Bluebeam/CostX pattern:
 * scale-calibrate a plan, then draw area polygons / length polylines / counts)
 * and runs the FULL round-trip the сметчик role centres on:
 *
 *   1. pick the drawing REVISION you are measuring against;
 *   2. draw a measurement → it persists against that revision (qty derived
 *      server-side from geometry + scale);
 *   3. edit the label / unit / assembly / rate and re-cost in place;
 *   4. push (or re-push) the measurement into a BOQ section as a costed line
 *      (quantity × rate), keeping a round-trip link so a re-cost updates the
 *      SAME BOQ line — never a duplicate;
 *   5. delete a measurement (optionally cascading its BOQ line);
 *   6. a STALE badge appears when a newer revision of the drawing has landed.
 *
 * Money is bigint MINOR throughout; rates are entered in major units and
 * converted here (USDT = 6dp, everything else = 2dp).
 */

import * as React from "react";
import {
  DrawingViewer,
  type DrawingStroke,
} from "@/components/ui/primitives";
import {
  quantityFor,
  TAKEOFF_UNIT,
  type ScaleSnapshot,
  type TakeoffKind,
} from "@/lib/development/takeoff-geometry";
import { EmptyState } from "@/components/ui/state";
import type {
  PersistedTakeoffWire,
} from "./_save-action";

interface BoqTarget {
  sectionId: string;
  label: string;
}
interface RevisionOption {
  revisionId: string;
  label: string;
  drawingCode: string;
  drawingTitle: string;
  revisionLabel: string;
  revisionDate: string;
  status: string;
  isLatest: boolean;
}

function minorMultiplier(currency: string): number {
  return currency.toUpperCase() === "USDT" ? 1_000_000 : 100;
}
function majorFromMinor(minor: string, currency: string): number {
  return Number(BigInt(minor || "0")) / minorMultiplier(currency);
}
function minorFromMajor(major: number, currency: string): string {
  return BigInt(Math.round(major * minorMultiplier(currency))).toString();
}

export function TakeoffWorkbench({
  boqTargets = [],
  revisionOptions = [],
  staleCount = 0,
}: {
  boqTargets?: BoqTarget[];
  revisionOptions?: RevisionOption[];
  staleCount?: number;
}) {
  const [revisionId, setRevisionId] = React.useState<string>("");
  const [imageUrl, setImageUrl] = React.useState<string>("");
  const [strokes, setStrokes] = React.useState<DrawingStroke[]>([]);
  const [scale, setScale] = React.useState<ScaleSnapshot | null>(null);
  const [currency, setCurrency] = React.useState("IDR");
  const [targetSectionId, setTargetSectionId] = React.useState("");

  const [persisted, setPersisted] = React.useState<PersistedTakeoffWire[]>([]);
  const [loadingPersisted, setLoadingPersisted] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [savingStrokeId, setSavingStrokeId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const selectedRevision = revisionOptions.find(
    (r) => r.revisionId === revisionId,
  );
  const revisionIsStale = selectedRevision ? !selectedRevision.isLatest : false;

  // Load persisted takeoffs whenever the chosen revision changes.
  const reloadPersisted = React.useCallback(async (rev: string) => {
    if (!rev) {
      setPersisted([]);
      return;
    }
    setLoadingPersisted(true);
    setError(null);
    const { loadTakeoffsAction } = await import("./_save-action");
    const res = await loadTakeoffsAction(rev);
    setLoadingPersisted(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPersisted(res.rows);
  }, []);

  React.useEffect(() => {
    void reloadPersisted(revisionId);
  }, [revisionId, reloadPersisted]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUrl(URL.createObjectURL(file));
    setStrokes([]);
    setScale(null);
  }

  // Persist a freshly-drawn stroke against the selected revision.
  async function persistStroke(stroke: DrawingStroke) {
    if (!revisionId) {
      setError("Pick a drawing revision before measuring.");
      return;
    }
    const kind = stroke.kind as TakeoffKind;
    const qty = quantityFor(kind, stroke.points, scale);
    if (qty == null) {
      setError("Calibrate the scale before measuring area / length.");
      return;
    }
    setSavingStrokeId(stroke.id);
    setError(null);
    const { saveTakeoffMeasurement } = await import("./_save-action");
    const res = await saveTakeoffMeasurement({
      drawingRevisionId: revisionId,
      label: stroke.label ?? "",
      kind,
      unitOfMeasure: TAKEOFF_UNIT[kind],
      geometry: stroke.points,
      scaleSnapshot: scale,
      unitRateMinor: "0",
      currency,
    });
    setSavingStrokeId(null);
    if (!res.ok) {
      // Keep the on-canvas stroke so the estimator can retry / re-measure.
      setError(res.error);
      return;
    }
    // Saved — drop the transient on-canvas stroke; it now lives in the DB and
    // re-renders in the persisted table below.
    setStrokes((prev) => prev.filter((s) => s.id !== stroke.id));
    await reloadPersisted(revisionId);
  }

  async function recost(
    row: PersistedTakeoffWire,
    patch: { label?: string; unitOfMeasure?: string; assembly?: string | null; rateMajor?: number },
  ) {
    setBusyId(row.id);
    setError(null);
    const { editTakeoffMeasurement } = await import("./_save-action");
    const res = await editTakeoffMeasurement({
      id: row.id,
      label: patch.label,
      unitOfMeasure: patch.unitOfMeasure,
      assembly: patch.assembly,
      unitRateMinor:
        patch.rateMajor != null
          ? minorFromMajor(patch.rateMajor, row.currency)
          : undefined,
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reloadPersisted(revisionId);
  }

  async function remove(row: PersistedTakeoffWire) {
    setBusyId(row.id);
    setError(null);
    const { deleteTakeoffMeasurement } = await import("./_save-action");
    const res = await deleteTakeoffMeasurement({ id: row.id, cascadeBoqLine: true });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reloadPersisted(revisionId);
  }

  async function push(row: PersistedTakeoffWire) {
    if (!targetSectionId) {
      setError("Pick a BOQ section to push into.");
      return;
    }
    setBusyId(row.id);
    setError(null);
    const { pushTakeoffToBoq } = await import("./_save-action");
    const res = await pushTakeoffToBoq({ id: row.id, sectionId: targetSectionId });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reloadPersisted(revisionId);
  }

  const total = persisted.reduce(
    (sum, r) => sum + Number(BigInt(r.lineCostMinor)),
    0,
  );
  const money = (minorTotal: number) =>
    `${currency} ${Math.round(minorTotal / minorMultiplier(currency)).toLocaleString("en-US")}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Revision picker + controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-soft bg-surface px-4 py-3">
        <label className="text-xs text-ink-secondary">
          Drawing revision
          <select
            value={revisionId}
            onChange={(e) => setRevisionId(e.target.value)}
            className="ml-1 text-xs px-2 py-1 rounded border border-line-soft bg-surface max-w-[280px]"
          >
            <option value="">Select revision…</option>
            {revisionOptions.map((r) => (
              <option key={r.revisionId} value={r.revisionId}>
                {r.label}
                {r.isLatest ? "" : " (superseded)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Plan image
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            className="ml-2 text-xs"
          />
        </label>
        <span className="text-xs text-ink-tertiary">or URL:</span>
        <input
          type="url"
          value={imageUrl.startsWith("blob:") ? "" : imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…/floor-plan.png"
          className="flex-1 min-w-[160px] text-xs px-2 py-1 rounded border border-line-soft bg-surface"
        />
        <label className="text-xs text-ink-secondary">
          Currency
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 4))}
            className="ml-1 w-16 text-xs px-2 py-1 rounded border border-line-soft bg-surface font-mono"
          />
        </label>
        {boqTargets.length > 0 && (
          <label className="text-xs text-ink-secondary">
            Push into BOQ
            <select
              value={targetSectionId}
              onChange={(e) => setTargetSectionId(e.target.value)}
              className="ml-1 text-xs px-2 py-1 rounded border border-line-soft bg-surface max-w-[220px]"
            >
              <option value="">Select section…</option>
              {boqTargets.map((t) => (
                <option key={t.sectionId} value={t.sectionId}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {staleCount > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-xs text-warning">
          {staleCount} persisted takeoff{staleCount === 1 ? "" : "s"} measured on
          a superseded revision — re-measure against the latest revision.
        </div>
      )}
      {revisionIsStale && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-xs text-warning">
          This revision has been superseded by a newer one. New takeoffs here
          will be flagged stale — measure on the latest revision instead.
        </div>
      )}
      {error && <p className="text-xs text-danger -mt-2">{error}</p>}

      {!revisionId ? (
        <EmptyState
          title="Pick a drawing revision"
          description="Select the drawing revision you are measuring against. Every measurement is pinned to that revision, so a newer revision flags older takeoffs as stale."
        />
      ) : !imageUrl ? (
        <div className="rounded-lg border border-dashed border-line-soft bg-muted/20 px-6 py-12 text-center text-sm text-ink-tertiary">
          Load the floor-plan or elevation for{" "}
          <span className="font-medium text-ink">
            {selectedRevision?.drawingCode} {selectedRevision?.revisionLabel}
          </span>{" "}
          to start measuring. Calibrate the scale first (pick two points a known
          distance apart), then draw area / length / count takeoffs.
        </div>
      ) : (
        <DrawingViewer
          imageUrl={imageUrl}
          strokes={strokes}
          scale={scale}
          onScaleSet={setScale}
          onStrokeAdd={(s) => {
            setStrokes((prev) => [...prev, s]);
            void persistStroke(s);
          }}
          onStrokeRemove={(id) =>
            setStrokes((prev) => prev.filter((s) => s.id !== id))
          }
        />
      )}

      {savingStrokeId && (
        <p className="text-xs text-ink-tertiary -mt-2">Saving measurement…</p>
      )}

      {/* Persisted takeoff → cost table (the round-trip surface) */}
      {revisionId && (
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line-soft flex items-center justify-between">
            <span className="text-sm font-medium text-ink">
              Persisted takeoff —{" "}
              {loadingPersisted
                ? "loading…"
                : `${persisted.length} measurement${persisted.length === 1 ? "" : "s"}`}
            </span>
            {!scale && imageUrl && (
              <span className="text-[11px] text-warning">
                Calibrate the scale to measure areas &amp; lengths.
              </span>
            )}
          </div>
          {persisted.length === 0 && !loadingPersisted ? (
            <div className="px-4 py-8 text-center text-xs text-ink-tertiary">
              No measurements yet for this revision. Draw on the plan above —
              each measurement is saved here automatically.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-tertiary border-b border-line-soft text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-2 font-normal">Item</th>
                  <th className="px-2 py-2 font-normal">Assembly</th>
                  <th className="px-2 py-2 font-normal">Type</th>
                  <th className="px-2 py-2 font-normal text-right">Quantity</th>
                  <th className="px-2 py-2 font-normal text-right">Unit rate</th>
                  <th className="px-4 py-2 font-normal text-right">Line cost</th>
                  <th className="px-2 py-2 font-normal text-right">BOQ</th>
                  <th className="px-2 py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {persisted.map((r) => (
                  <PersistedRow
                    key={r.id}
                    row={r}
                    busy={busyId === r.id}
                    onRecost={recost}
                    onPush={push}
                    onRemove={remove}
                    canPush={!!targetSectionId}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong">
                  <td colSpan={5} className="px-4 py-2.5 text-right text-sm font-medium text-ink">
                    Total takeoff
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sm font-semibold text-accent">
                    {money(total)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function PersistedRow({
  row,
  busy,
  onRecost,
  onPush,
  onRemove,
  canPush,
}: {
  row: PersistedTakeoffWire;
  busy: boolean;
  onRecost: (
    row: PersistedTakeoffWire,
    patch: { label?: string; unitOfMeasure?: string; assembly?: string | null; rateMajor?: number },
  ) => void;
  onPush: (row: PersistedTakeoffWire) => void;
  onRemove: (row: PersistedTakeoffWire) => void;
  canPush: boolean;
}) {
  const [label, setLabel] = React.useState(row.label);
  const [assembly, setAssembly] = React.useState(row.assembly ?? "");
  const [rate, setRate] = React.useState(
    majorFromMinor(row.unitRateMinor, row.currency) || 0,
  );
  React.useEffect(() => {
    setLabel(row.label);
    setAssembly(row.assembly ?? "");
    setRate(majorFromMinor(row.unitRateMinor, row.currency) || 0);
  }, [row.label, row.assembly, row.unitRateMinor, row.currency]);

  const lineCostMajor =
    Number(BigInt(row.lineCostMinor)) / minorMultiplier(row.currency);

  return (
    <tr className="border-b border-line-soft">
      <td className="px-4 py-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() =>
            label !== row.label && onRecost(row, { label })
          }
          placeholder="e.g. Floor screed"
          disabled={busy}
          className="w-full text-xs px-2 py-1 rounded border border-line-soft bg-surface"
        />
        {row.isStale && (
          <span className="mt-1 inline-block text-[10px] text-warning">
            Stale — newer revision exists
          </span>
        )}
        {row.boqLineMissing && (
          <span className="mt-1 inline-block text-[10px] text-danger">
            BOQ line deleted — re-push to relink
          </span>
        )}
      </td>
      <td className="px-2 py-2">
        <input
          value={assembly}
          onChange={(e) => setAssembly(e.target.value)}
          onBlur={() =>
            assembly !== (row.assembly ?? "") &&
            onRecost(row, { assembly: assembly || null })
          }
          placeholder="—"
          disabled={busy}
          className="w-24 text-xs px-2 py-1 rounded border border-line-soft bg-surface"
        />
      </td>
      <td className="px-2 py-2 text-xs text-ink-secondary uppercase">
        {row.kind}
      </td>
      <td className="px-2 py-2 text-right font-mono tabular-nums text-xs">
        {row.rawQuantity.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
        {row.unitOfMeasure}
      </td>
      <td className="px-2 py-2 text-right">
        <input
          type="number"
          min={0}
          value={rate || ""}
          onChange={(e) => setRate(Number(e.target.value) || 0)}
          onBlur={() =>
            rate !== majorFromMinor(row.unitRateMinor, row.currency) &&
            onRecost(row, { rateMajor: rate })
          }
          placeholder="0"
          disabled={busy}
          className="w-28 text-xs px-2 py-1 rounded border border-line-soft bg-surface font-mono text-right"
        />
      </td>
      <td className="px-4 py-2 text-right font-mono tabular-nums text-xs text-ink">
        {row.currency} {Math.round(lineCostMajor).toLocaleString("en-US")}
      </td>
      <td className="px-2 py-2 text-right">
        {row.boqItemId && !row.boqLineMissing ? (
          <button
            type="button"
            disabled={busy || !canPush}
            onClick={() => onPush(row)}
            title="Re-push the current quantity & rate into the linked BOQ line"
            className="text-[11px] px-2 py-0.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-40"
          >
            {busy ? "…" : "Re-push"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !canPush || !(row.rawQuantity > 0) || row.unitRateMinor === "0"}
            onClick={() => onPush(row)}
            title="Create a costed BOQ line from this measurement"
            className="text-[11px] px-2 py-0.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-40"
          >
            {busy ? "…" : "Push to BOQ"}
          </button>
        )}
      </td>
      <td className="px-2 py-2 text-right">
        <button
          type="button"
          disabled={busy}
          onClick={() => onRemove(row)}
          title="Delete this measurement (and its BOQ line)"
          className="text-[11px] px-2 py-0.5 rounded border border-line-soft bg-surface text-danger hover:bg-danger/10 disabled:opacity-40"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
