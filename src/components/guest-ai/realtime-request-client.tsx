"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALLOWED_EVENT_TYPES,
  makeDedupe,
  makeReadReceiptGate,
  type ConciergeEvent,
  type EventType,
} from "@/features/realtime/events";
import { markGuestRepliesReadAction } from "@/features/guest-ai-concierge/read-receipts-actions";

/**
 * V9M — guest realtime client. Subscribes to
 * `/stay/[token]/requests/[code]/stream`, dedupes events, dispatches
 * a debounced `markGuestRepliesReadAction` after staff replies arrive,
 * and triggers `router.refresh()` so the parent server page re-fetches
 * the timeline.
 *
 * SSE feature-detected; non-supporting browsers see a "manual refresh"
 * fallback message inline.
 */
export interface RealtimeRequestClientProps {
  token: string;
  handoffCode: string;
  handoffStatus: string;
}

type ConnectionState =
  | { kind: "idle" }
  | { kind: "unsupported" }
  | { kind: "connecting" }
  | { kind: "live" }
  | { kind: "reconnecting"; attempt: number }
  | { kind: "error"; message: string };

export function RealtimeRequestClient({
  token,
  handoffCode,
  handoffStatus,
}: RealtimeRequestClientProps) {
  const router = useRouter();
  const [conn, setConn] = useState<ConnectionState>({ kind: "idle" });
  const [closed, setClosed] = useState(
    handoffStatus === "resolved" || handoffStatus === "cancelled",
  );

  const dedupeRef = useRef(makeDedupe(512));
  const readGateRef = useRef(makeReadReceiptGate(2_000));

  useEffect(() => {
    if (closed) return;
    if (typeof window === "undefined" || !("EventSource" in window)) {
      setConn({ kind: "unsupported" });
      return;
    }

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        router.refresh();
      }, 350);
    };

    const url = `/stay/${encodeURIComponent(token)}/requests/${encodeURIComponent(handoffCode)}/stream`;
    setConn({ kind: "connecting" });

    const es = new EventSource(url);

    es.addEventListener("open", () => {
      setConn({ kind: "live" });
    });
    es.addEventListener("error", () => {
      setConn((c) =>
        c.kind === "live"
          ? { kind: "reconnecting", attempt: 1 }
          : c.kind === "reconnecting"
            ? { kind: "reconnecting", attempt: c.attempt + 1 }
            : { kind: "error", message: "Couldn't reach updates." },
      );
    });

    function handleEvent(event: ConciergeEvent) {
      switch (event.type as EventType) {
        case "connected":
        case "heartbeat":
          return;
        case "error":
          setConn({
            kind: "error",
            message:
              (event.payload as { message?: string }).message ??
              "Live updates paused.",
          });
          es.close();
          return;
        case "handoff_status_changed": {
          const status = (event.payload as { status?: string }).status;
          if (status === "resolved" || status === "cancelled") {
            setClosed(true);
            es.close();
          }
          scheduleRefresh();
          return;
        }
        case "reply_created": {
          scheduleRefresh();
          if (readGateRef.current.shouldEmit()) {
            const fd = new FormData();
            fd.append("token", token);
            fd.append("handoffCode", handoffCode);
            void markGuestRepliesReadAction(null, fd).catch(() => {
              /* best-effort */
            });
          }
          return;
        }
        case "reply_read":
        case "attachment_processing":
        case "attachment_uploaded":
        case "attachment_failed":
        case "attachment_created":
        case "unread_count_changed":
          scheduleRefresh();
          return;
      }
    }

    for (const t of ALLOWED_EVENT_TYPES) {
      es.addEventListener(t, (evt) => {
        const me = evt as MessageEvent<string>;
        if (!me.data) return;
        let parsed: ConciergeEvent | null = null;
        try {
          parsed = JSON.parse(me.data) as ConciergeEvent;
        } catch {
          return;
        }
        if (!parsed?.id || !parsed?.type) return;
        if (dedupeRef.current.seen(parsed.id)) return;
        handleEvent(parsed);
      });
    }

    return () => {
      es.close();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [token, handoffCode, closed, router]);

  return (
    <div className="text-[11px] text-ink-tertiary flex items-center gap-2">
      {conn.kind === "live" && (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          Live
        </span>
      )}
      {conn.kind === "connecting" && <span>Connecting…</span>}
      {conn.kind === "reconnecting" && <span>Reconnecting…</span>}
      {conn.kind === "unsupported" && (
        <span>
          Live updates aren&apos;t supported in this browser. Pull to
          refresh to see new replies.
        </span>
      )}
      {conn.kind === "error" && <span>{conn.message}</span>}
      {closed && conn.kind !== "unsupported" && (
        <span className="text-ink-tertiary">Conversation closed.</span>
      )}
    </div>
  );
}
