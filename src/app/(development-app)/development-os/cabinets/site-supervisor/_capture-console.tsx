"use client";

/**
 * Site-supervisor field-capture console — the WRITE workflow.
 *
 * Mobile-first. Crew-on-shift counter + active-zone chips set the
 * capture context; the action row files Photo / Incident / Voice /
 * Note frames; the today feed lists captured frames (deletable); and
 * "Compile & send daily summary" runs the AI digest to the director.
 *
 * Styling matches the surrounding cabinet — handoff `.card` / `.btn` /
 * `.badge` classes + cream/stone/ink tokens (no raw bg-black buttons).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  captureNote,
  captureIncident,
  capturePhoto,
  captureVoiceNote,
  deleteCaptureFrame,
  compileDailySummary,
  type CaptureFrameRow,
  type ZoneChip,
} from "@/lib/development/server/cabinets/site-supervisor-capture-actions";

type Mode = "idle" | "note" | "incident";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.includes(",") ? res.split(",")[1] : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CaptureConsole({
  zones,
  frames,
}: {
  zones: ZoneChip[];
  frames: CaptureFrameRow[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [crew, setCrew] = React.useState(0);
  const [zone, setZone] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<Mode>("idle");
  const [noteBody, setNoteBody] = React.useState("");
  const [incidentBody, setIncidentBody] = React.useState("");
  const [incidentSeverity, setIncidentSeverity] =
    React.useState<"high" | "normal">("normal");
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const voiceInputRef = React.useRef<HTMLInputElement>(null);

  function run(p: Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setError(null);
    setFlash(null);
    start(async () => {
      try {
        const r = await p;
        if (!r.ok) {
          setError(r.error ?? "Action failed.");
          return;
        }
        setFlash(okMsg);
        setMode("idle");
        setNoteBody("");
        setIncidentBody("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  async function onPhoto(file: File) {
    const base64 = await fileToBase64(file);
    run(
      capturePhoto({
        activeZone: zone,
        crewOnShift: crew,
        fileName: file.name || "photo.jpg",
        mimeType: file.type || "image/jpeg",
        sizeBytes: file.size,
        fileBase64: base64,
      }),
      "Photo captured.",
    );
  }

  async function onVoice(file: File) {
    const base64 = await fileToBase64(file);
    run(
      captureVoiceNote({
        activeZone: zone,
        crewOnShift: crew,
        fileName: file.name || "voice.webm",
        mimeType: file.type || "audio/webm",
        sizeBytes: file.size,
        fileBase64: base64,
      }),
      "Voice note stored (transcription deferred).",
    );
  }

  const btn = "btn btn-sm";

  return (
    <div className="max-w-[640px]">
      {/* Capture context: crew counter + zone chips */}
      <Card className="p-4 mb-3">
        <div className="label mb-2">Capture context</div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[13px] text-ink-2">Crew on shift</span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              className="btn btn-dark btn-sm min-w-[40px] min-h-[40px]"
              onClick={() => setCrew((c) => Math.max(0, c - 1))}
              aria-label="Decrease crew"
            >
              −
            </button>
            <span className="mono text-[20px] font-medium min-w-[36px] text-center">
              {crew}
            </span>
            <button
              type="button"
              className="btn btn-dark btn-sm min-w-[40px] min-h-[40px]"
              onClick={() => setCrew((c) => Math.min(9999, c + 1))}
              aria-label="Increase crew"
            >
              +
            </button>
          </div>
        </div>

        <div className="label mb-1.5">Active zone</div>
        {zones.length === 0 ? (
          <p className="text-[12px] text-ink-3 italic m-0">
            No zones configured — captures file without a zone tag.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {zones.map((z) => {
              const active = zone === z.label;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setZone(active ? null : z.label)}
                  className={
                    "badge cursor-pointer min-h-[36px] px-3 " +
                    (active ? "badge-ok" : "")
                  }
                >
                  {z.label}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Capture action row */}
      <Card className="p-4 mb-3">
        <div className="label mb-2">Capture</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-amber min-h-[48px]"
            disabled={pending}
            onClick={() => photoInputRef.current?.click()}
          >
            📷 Photo
          </button>
          <button
            type="button"
            className="btn btn-dark min-h-[48px]"
            disabled={pending}
            onClick={() => voiceInputRef.current?.click()}
          >
            🎙 Voice note
          </button>
          <button
            type="button"
            className="btn btn-dark min-h-[48px]"
            disabled={pending}
            onClick={() => setMode(mode === "incident" ? "idle" : "incident")}
          >
            ⚠ Incident
          </button>
          <button
            type="button"
            className="btn btn-secondary min-h-[48px]"
            disabled={pending}
            onClick={() => setMode(mode === "note" ? "idle" : "note")}
          >
            ＋ Note
          </button>
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPhoto(f);
            e.target.value = "";
          }}
        />
        <input
          ref={voiceInputRef}
          type="file"
          accept="audio/*"
          capture
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onVoice(f);
            e.target.value = "";
          }}
        />

        {mode === "note" && (
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              rows={2}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Field note…"
              className="w-full rounded-[10px] border border-line bg-bg-3 px-3 py-2 text-[14px]"
            />
            <button
              type="button"
              className={btn + " btn-amber"}
              disabled={pending || noteBody.trim().length === 0}
              onClick={() =>
                run(
                  captureNote({
                    activeZone: zone,
                    crewOnShift: crew,
                    body: noteBody.trim(),
                  }),
                  "Note captured.",
                )
              }
            >
              {pending ? "…" : "Save note"}
            </button>
          </div>
        )}

        {mode === "incident" && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setIncidentSeverity("normal")}
                className={
                  "badge cursor-pointer min-h-[34px] px-3 " +
                  (incidentSeverity === "normal" ? "badge-warn" : "")
                }
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setIncidentSeverity("high")}
                className={
                  "badge cursor-pointer min-h-[34px] px-3 " +
                  (incidentSeverity === "high" ? "badge-danger" : "")
                }
              >
                High
              </button>
            </div>
            <textarea
              rows={2}
              value={incidentBody}
              onChange={(e) => setIncidentBody(e.target.value)}
              placeholder="What happened…"
              className="w-full rounded-[10px] border border-line bg-bg-3 px-3 py-2 text-[14px]"
            />
            <button
              type="button"
              className={btn + " btn-amber"}
              disabled={pending || incidentBody.trim().length === 0}
              onClick={() =>
                run(
                  captureIncident({
                    activeZone: zone,
                    crewOnShift: crew,
                    severity: incidentSeverity,
                    body: incidentBody.trim(),
                  }),
                  "Incident logged.",
                )
              }
            >
              {pending ? "…" : "Log incident"}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-2 text-[12px] text-danger m-0" role="alert">
            {error}
          </p>
        )}
        {flash && (
          <p className="mt-2 text-[12px] text-success m-0">{flash}</p>
        )}
      </Card>

      {/* Today feed */}
      <Card padding="none" overflowHidden className="mb-3">
        <div className="px-4 py-3 border-b border-line flex items-baseline">
          <h2 className="display text-[18px] font-medium m-0">Today&apos;s feed</h2>
          <span className="mono ml-auto text-[11px] text-ink-3">
            {frames.length} frame{frames.length === 1 ? "" : "s"}
          </span>
        </div>
        {frames.length === 0 ? (
          <p className="p-4 text-[13px] text-ink-3 italic m-0">
            Nothing captured yet today. Photos, incidents, voice notes and
            field notes appear here as you capture them.
          </p>
        ) : (
          <ul className="clean py-1 m-0">
            {frames.map((f) => (
              <li
                key={f.id}
                className="px-4 py-3 flex items-start gap-3 border-b border-line"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <HandoffBadge tone={frameTone(f)}>
                      {frameLabel(f)}
                    </HandoffBadge>
                    {f.activeZone && (
                      <span className="mono text-[10px] text-ink-3">
                        {f.activeZone}
                      </span>
                    )}
                    <span className="mono ml-auto text-[10px] text-ink-3">
                      {new Date(f.capturedAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {f.title && (
                    <div className="text-[13px] font-medium">{f.title}</div>
                  )}
                  {f.body && f.frameType !== "daily_summary" && (
                    <p className="m-0 text-[12.5px] text-ink-2 leading-[1.4]">
                      {f.body}
                    </p>
                  )}
                  {f.frameType === "voice" && f.transcriptText && (
                    <p className="m-0 mt-0.5 text-[12px] text-ink-3 italic">
                      {f.transcriptText}
                    </p>
                  )}
                  {f.frameType === "daily_summary" && (
                    <details className="mt-1">
                      <summary className="text-[12px] text-ink-2 cursor-pointer">
                        View compiled summary
                      </summary>
                      <pre className="mt-1 whitespace-pre-wrap text-[12px] text-ink-2 font-[inherit] m-0">
                        {f.body}
                      </pre>
                    </details>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0"
                  disabled={pending}
                  onClick={() =>
                    run(deleteCaptureFrame({ frameId: f.id }), "Frame deleted.")
                  }
                  aria-label="Delete frame"
                  title="Delete"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Compile & send daily summary */}
      <button
        type="button"
        className="btn btn-light w-full min-h-[52px] text-[15px]"
        disabled={pending}
        onClick={() =>
          run(
            compileDailySummary({ activeZone: zone, crewOnShift: crew }),
            "Daily summary compiled + sent to director.",
          )
        }
      >
        {pending ? "Compiling…" : "Compile & send daily summary"}
      </button>
    </div>
  );
}

function frameLabel(f: CaptureFrameRow): string {
  switch (f.frameType) {
    case "photo":
      return "Photo";
    case "incident":
      return f.severity === "high" ? "Incident · high" : "Incident";
    case "voice":
      return "Voice";
    case "note":
      return "Note";
    case "daily_summary":
      return "Daily summary";
    default:
      return f.frameType;
  }
}

function frameTone(
  f: CaptureFrameRow,
): "ok" | "warn" | "danger" | undefined {
  if (f.frameType === "incident")
    return f.severity === "high" ? "danger" : "warn";
  if (f.frameType === "daily_summary") return "ok";
  return undefined;
}
