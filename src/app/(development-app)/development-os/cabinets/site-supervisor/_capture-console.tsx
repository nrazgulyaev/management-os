"use client";

/**
 * Site-supervisor field-capture console — the WRITE workflow.
 *
 * Pixel-redesigned to the designer's mock
 * (`cc-functional-handoff/cabinets/dev-p2/site-supervisor.html`): a
 * mobile-first, camera-first capture surface. A carbon LIVE-CAPTURE
 * topbar sets context (project + live pulse); the crew-on-shift stepper
 * and active-zone chips set the capture context; the action row files
 * Photo / Incident / Voice / Note frames; the today feed lists captured
 * frames (deletable, severity-badged); and "Compile & send daily
 * summary" runs the AI digest to the director, surfaced in a carbon
 * digest band.
 *
 * Visual = Development OS palette (Space Grotesk display, IBM Plex Mono
 * numbers, amber accent, carbon inverted bands) via Layer-B tokens +
 * @/components/ui primitives. No raw hex / no style={{}} (only genuinely
 * dynamic computed values). Every server action + prop is preserved.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, TriangleAlert, Mic, Plus, X } from "lucide-react";
import { Card, HandoffBadge, Pulse } from "@/components/dashboard/primitives";
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
  projectLabel,
}: {
  zones: ZoneChip[];
  frames: CaptureFrameRow[];
  projectLabel?: string;
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

  const activeZoneCount = zone ? 1 : 0;
  const digestFrame = frames.find((f) => f.frameType === "daily_summary");

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

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Carbon LIVE-CAPTURE topbar */}
      <div className="flex items-center gap-3 rounded-t-[16px] bg-carbon px-5 py-3.5 text-white">
        <div className="min-w-0">
          <div className="display text-[16px] font-semibold leading-tight truncate">
            {projectLabel ?? "On-site capture"}
          </div>
          <div className="mono text-[11px] text-white/65 mt-0.5">
            {new Date().toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}{" "}
            · site supervisor on site
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 mono text-[11px] tracking-[0.14em] text-white/85">
          <Pulse />
          LIVE CAPTURE
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-b-[16px] border border-t-0 border-line-2 bg-bg-2 p-[18px]">
        {/* Crew on shift — stepper */}
        <Card className="p-[18px]">
          <div className="label text-[10px] tracking-[0.14em] text-ink-4 mb-2">
            Crew on shift
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="grid h-[46px] w-[46px] place-items-center rounded-[12px] border border-line-2 bg-bg-2 text-[24px] text-ink hover:bg-bg-3 active:bg-bg-3"
              onClick={() => setCrew((c) => Math.max(0, c - 1))}
              aria-label="Decrease crew"
            >
              –
            </button>
            <div className="display min-w-[60px] text-center text-[40px] font-semibold leading-none">
              {crew}
            </div>
            <button
              type="button"
              className="grid h-[46px] w-[46px] place-items-center rounded-[12px] border border-line-2 bg-bg-2 text-[24px] text-ink hover:bg-bg-3 active:bg-bg-3"
              onClick={() => setCrew((c) => Math.min(9999, c + 1))}
              aria-label="Increase crew"
            >
              +
            </button>
            <div className="ml-auto text-[12.5px] text-ink-3">
              across {activeZoneCount} zone{activeZoneCount === 1 ? "" : "s"}
            </div>
          </div>
        </Card>

        {/* Active zones — chips */}
        <Card className="p-[18px]">
          <div className="label text-[10px] tracking-[0.14em] text-ink-4 mb-2">
            Active zone
          </div>
          {zones.length === 0 ? (
            <p className="m-0 text-[12.5px] italic text-ink-3">
              No zones configured — captures file without a zone tag.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {zones.map((z) => {
                const active = zone === z.label;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setZone(active ? null : z.label)}
                    className={
                      "rounded-[999px] border px-3.5 py-2.5 text-[13px] transition-colors " +
                      (active
                        ? "border-carbon bg-carbon text-white"
                        : "border-line-2 bg-bg-2 text-ink-3 hover:border-line-3")
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
        <Card className="p-[18px]">
          <div className="label text-[10px] tracking-[0.14em] text-ink-4 mb-2">
            Capture
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              className="group flex flex-col items-center gap-1.5 rounded-[14px] border border-line-2 bg-bg-2 px-2 py-4 text-[13px] font-medium text-ink hover:border-amber disabled:opacity-50"
              disabled={pending}
              onClick={() => photoInputRef.current?.click()}
            >
              <Camera className="h-[26px] w-[26px] text-amber" strokeWidth={1.6} />
              Photo
            </button>
            <button
              type="button"
              className="group flex flex-col items-center gap-1.5 rounded-[14px] border border-line-2 bg-bg-2 px-2 py-4 text-[13px] font-medium text-ink hover:border-amber disabled:opacity-50"
              disabled={pending}
              onClick={() => setMode(mode === "incident" ? "idle" : "incident")}
            >
              <TriangleAlert
                className="h-[26px] w-[26px] text-amber"
                strokeWidth={1.6}
              />
              Incident
            </button>
            <button
              type="button"
              className="group flex flex-col items-center gap-1.5 rounded-[14px] border border-line-2 bg-bg-2 px-2 py-4 text-[13px] font-medium text-ink hover:border-amber disabled:opacity-50"
              disabled={pending}
              onClick={() => voiceInputRef.current?.click()}
            >
              <Mic className="h-[26px] w-[26px] text-amber" strokeWidth={1.6} />
              Voice
            </button>
          </div>

          {/* Secondary: quick text note */}
          <button
            type="button"
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-line-2 bg-bg-3 px-2 py-2.5 text-[12.5px] text-ink-2 hover:border-amber disabled:opacity-50"
            disabled={pending}
            onClick={() => setMode(mode === "note" ? "idle" : "note")}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Field note
          </button>

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
                placeholder="Describe briefly…"
                className="textarea"
              />
              <button
                type="button"
                className="btn btn-amber btn-sm self-end"
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
                {pending ? "…" : "Capture"}
              </button>
            </div>
          )}

          {mode === "incident" && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="label text-[10.5px] tracking-[0.16em] text-ink-3">
                Severity
              </div>
              <div className="flex gap-2">
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
              </div>
              <textarea
                rows={2}
                value={incidentBody}
                onChange={(e) => setIncidentBody(e.target.value)}
                placeholder="What happened…"
                className="textarea"
              />
              <button
                type="button"
                className="btn btn-amber btn-sm self-end"
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
                {pending ? "…" : "Capture"}
              </button>
            </div>
          )}

          {error && (
            <p className="mt-2 m-0 text-[12px] text-danger" role="alert">
              {error}
            </p>
          )}
          {flash && (
            <p className="mt-2 m-0 text-[12px] text-success">{flash}</p>
          )}
        </Card>

        {/* Today's feed */}
        <Card className="p-[18px]">
          <h3 className="display m-0 mb-1 text-[17px] font-semibold">
            Today&apos;s feed{" "}
            <span className="mono text-[12px] font-normal text-ink-4">
              · {frames.length}
            </span>
          </h3>
          {frames.length === 0 ? (
            <p className="m-0 text-[13px] text-ink-4">
              Empty — capture photos and events.
            </p>
          ) : (
            <ul className="list-none m-0 p-0">
              {frames.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start gap-3 border-b border-line-soft py-3 last:border-b-0"
                >
                  <div className="ss-thumb-fill flex h-14 w-14 flex-none items-center justify-center rounded-[10px] mono text-[9px] text-ink-4">
                    {frameGlyph(f)}
                  </div>
                  <div className="min-w-0 flex-1">
                    {f.title && (
                      <div className="text-[14px] font-medium text-ink">
                        {f.title}
                      </div>
                    )}
                    {f.body && f.frameType !== "daily_summary" && (
                      <p className="m-0 text-[13px] leading-[1.45] text-ink-2">
                        {f.body}
                      </p>
                    )}
                    {f.frameType === "voice" && f.transcriptText && (
                      <p className="m-0 mt-0.5 text-[12.5px] italic text-ink-3">
                        {f.transcriptText}
                      </p>
                    )}
                    {f.frameType === "daily_summary" && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[12.5px] text-ink-2">
                          View compiled summary
                        </summary>
                        <pre className="m-0 mt-1 whitespace-pre-wrap font-[inherit] text-[12px] text-ink-2">
                          {f.body}
                        </pre>
                      </details>
                    )}
                    <div className="mono mt-1.5 flex items-center gap-2 text-[10.5px] text-ink-4">
                      <FrameSeverity f={f} />
                      {f.activeZone && <span>{f.activeZone}</span>}
                      <span>
                        {new Date(f.capturedAt).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="flex-none border-0 bg-transparent p-1 text-ink-4 hover:text-ink disabled:opacity-50"
                    disabled={pending}
                    onClick={() =>
                      run(deleteCaptureFrame({ frameId: f.id }), "Frame deleted.")
                    }
                    aria-label="Delete frame"
                    title="Delete"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="btn btn-amber mt-3.5 w-full"
            disabled={pending}
            onClick={() =>
              run(
                compileDailySummary({ activeZone: zone, crewOnShift: crew }),
                "Daily summary compiled + sent to director.",
              )
            }
          >
            {pending ? (
              <>
                <span className="ss-spin" />
                &nbsp;Compiling summary…
              </>
            ) : (
              "Compile & send daily summary"
            )}
          </button>
        </Card>

        {/* AI daily digest band */}
        {digestFrame && (
          <div className="rounded-[16px] bg-carbon p-5 text-white">
            <div className="mono mb-2.5 text-[10.5px] tracking-[0.14em] text-amber">
              Daily digest · compiled by AI
            </div>
            <pre className="m-0 whitespace-pre-wrap font-sans text-[14px] leading-[1.6] text-white">
              {digestFrame.body}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function frameGlyph(f: CaptureFrameRow): string {
  switch (f.frameType) {
    case "incident":
      return "!";
    case "voice":
      return "mic";
    case "note":
      return "note";
    case "daily_summary":
      return "AI";
    default:
      return "photo";
  }
}

function FrameSeverity({ f }: { f: CaptureFrameRow }) {
  if (f.frameType === "incident") {
    return (
      <HandoffBadge tone={f.severity === "high" ? "danger" : "warn"}>
        {f.severity === "high" ? "Incident · high" : "Incident"}
      </HandoffBadge>
    );
  }
  if (f.frameType === "daily_summary") {
    return <HandoffBadge tone="ok">Daily summary</HandoffBadge>;
  }
  if (f.frameType === "voice") return <HandoffBadge>Voice</HandoffBadge>;
  if (f.frameType === "note") return <HandoffBadge>Note</HandoffBadge>;
  return <HandoffBadge>Photo</HandoffBadge>;
}
