/**
 * Stage 10.B — VoiceNote primitive.
 *
 * Press-and-hold record button (Properly damage-note pattern + Procore
 * site-log voice memo). Captures via MediaRecorder API; produces a
 * Blob the parent uploads. Falls back gracefully when getUserMedia is
 * unsupported (button disabled with tooltip).
 *
 * Critical for 10.D Cleaner where typing is friction (Bahasa
 * Indonesia + low literacy considerations) and for 10.F PM site
 * reports where context-rich audio beats sparse text.
 *
 * Client component.
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Trash2 } from "lucide-react";

export interface VoiceNoteData {
  id: string;
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

export interface VoiceNoteProps {
  onCapture: (note: VoiceNoteData) => void;
  /** Hard cap; the recorder auto-stops at this. Default 60s. */
  maxDurationMs?: number;
  /** Show captured notes (parent owns state). */
  notes?: VoiceNoteData[];
  onRemove?: (id: string) => void;
  className?: string;
}

export function VoiceNote({
  onCapture,
  maxDurationMs = 60_000,
  notes = [],
  onRemove,
  className,
}: VoiceNoteProps) {
  const [recording, setRecording] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [supported, setSupported] = React.useState(true);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const startedAtRef = React.useRef<number>(0);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setSupported(false);
    }
  }, []);

  async function start() {
    if (!supported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        const durationMs = Date.now() - startedAtRef.current;
        if (blob.size > 0) {
          onCapture({
            id: crypto.randomUUID(),
            blob,
            durationMs,
            mimeType: blob.type,
          });
        }
        setRecording(false);
        setElapsed(0);
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
      };
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start();
      setRecording(true);
      tickRef.current = setInterval(() => {
        const e = Date.now() - startedAtRef.current;
        setElapsed(e);
        if (e >= maxDurationMs) stop();
      }, 100);
    } catch {
      setSupported(false);
    }
  }

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  React.useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, []);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onMouseDown={start}
        onMouseUp={stop}
        onMouseLeave={() => recording && stop()}
        onTouchStart={start}
        onTouchEnd={stop}
        disabled={!supported}
        aria-label={recording ? "Recording, release to stop" : "Hold to record"}
        className={cn(
          "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full border text-sm font-medium select-none touch-none",
          recording
            ? "bg-danger text-white border-danger animate-pulse"
            : "bg-surface text-ink border-line-soft",
          !supported && "opacity-50 pointer-events-none",
        )}
      >
        {supported ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        {recording ? `Recording ${formatMs(elapsed)} · release` : "Hold to record"}
      </button>
      {!supported && (
        <p className="text-xs text-ink-tertiary">
          Voice recording not supported on this device.
        </p>
      )}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5 max-w-sm" aria-label="Voice notes">
          {notes.map((n) => (
            <li
              key={n.id}
              className="flex items-center gap-2 px-3 py-2 bg-muted rounded-sm text-sm"
            >
              <Mic className="w-4 h-4 text-accent shrink-0" />
              <span className="font-mono tabular-nums text-ink-secondary">
                {formatMs(n.durationMs)}
              </span>
              <span className="text-ink-tertiary text-xs ml-auto truncate">
                {n.mimeType.replace("audio/", "")}
              </span>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(n.id)}
                  aria-label="Remove voice note"
                  className="text-ink-tertiary hover:text-danger"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
