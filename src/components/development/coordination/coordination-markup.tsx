"use client";

/**
 * Coordination markup layer — persistent drawing annotations.
 *
 * Wraps the shared DrawingViewer primitive and persists its strokes (+ scale)
 * to coordination_annotations (migration 0139), so markup reloads on the
 * viewer. Loads the saved set on mount, then saves on every change (debounced
 * to one in-flight write). All writes go through the permission-gated,
 * audit-logged saveCoordinationAnnotations action.
 *
 * Reuses @/components/ui/state for loading / error and the cream/stone/ink
 * tokens. No raw bg-black buttons; no style={{}}.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import {
  DrawingViewer,
  type DrawingStroke,
  type ScaleCalibration,
} from "@/components/ui/primitives";
import { LoadingState } from "@/components/ui/state";
import {
  saveCoordinationAnnotations,
  fetchCoordinationAnnotations,
} from "@/lib/development/server/coordination/coordination-actions";

type SaveState = "idle" | "saving" | "saved" | "error";

export function CoordinationMarkup({
  revisionId,
  imageUrl,
  imageAlt,
}: {
  revisionId: string;
  imageUrl: string;
  imageAlt: string;
}) {
  const [strokes, setStrokes] = useState<DrawingStroke[] | null>(null);
  const [scale, setScale] = useState<ScaleCalibration | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // One in-flight save; the latest payload wins (coalesced).
  const inFlight = useRef(false);
  const queued = useRef(false);
  const latest = useRef<{ strokes: DrawingStroke[]; scale: ScaleCalibration | null }>({
    strokes: [],
    scale: null,
  });

  // Load saved markup on mount / revision change.
  useEffect(() => {
    let active = true;
    setStrokes(null);
    fetchCoordinationAnnotations({ revisionId })
      .then((state) => {
        if (!active) return;
        const loaded = state.strokes as DrawingStroke[];
        setStrokes(loaded);
        const sc =
          state.scalePixels != null && state.scaleMeters != null
            ? { pixels: state.scalePixels, meters: state.scaleMeters }
            : null;
        setScale(sc);
        latest.current = { strokes: loaded, scale: sc };
      })
      .catch(() => {
        if (active) {
          setStrokes([]);
          latest.current = { strokes: [], scale: null };
        }
      });
    return () => {
      active = false;
    };
  }, [revisionId]);

  const flush = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    setErrorMsg(null);
    try {
      const payload = latest.current;
      await saveCoordinationAnnotations({
        revisionId,
        strokes: payload.strokes,
        scalePixels: payload.scale?.pixels ?? null,
        scaleMeters: payload.scale?.meters ?? null,
      });
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to save markup");
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void flush();
      }
    }
  }, [revisionId]);

  const persist = useCallback(
    (nextStrokes: DrawingStroke[], nextScale: ScaleCalibration | null) => {
      latest.current = { strokes: nextStrokes, scale: nextScale };
      void flush();
    },
    [flush],
  );

  if (strokes === null) {
    return <LoadingState label="Loading markup…" />;
  }

  return (
    <div className="flex flex-col gap-2">
      <DrawingViewer
        imageUrl={imageUrl}
        imageAlt={imageAlt}
        strokes={strokes}
        scale={scale}
        noteTool
        onStrokeAdd={(s) => {
          const next = [...strokes, s];
          setStrokes(next);
          persist(next, scale);
        }}
        onStrokeRemove={(id) => {
          const next = strokes.filter((s) => s.id !== id);
          setStrokes(next);
          persist(next, scale);
        }}
        onScaleSet={(s) => {
          setScale(s);
          persist(strokes, s);
        }}
      />
      <div className="flex items-center gap-2 text-xs">
        {saveState === "saving" && (
          <span className="flex items-center gap-1 text-ink-tertiary">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving markup…
          </span>
        )}
        {saveState === "saved" && (
          <span className="flex items-center gap-1 text-success">
            <Check className="w-3.5 h-3.5" /> Markup saved
          </span>
        )}
        {saveState === "error" && (
          <span className="flex items-center gap-1 text-danger">
            <AlertCircle className="w-3.5 h-3.5" /> {errorMsg ?? "Save failed"}
          </span>
        )}
        {saveState === "idle" && (
          <span className="text-ink-tertiary">
            Draw measurements or drop a Note, then it auto-saves to this
            revision and reloads next visit.
          </span>
        )}
      </div>
    </div>
  );
}
