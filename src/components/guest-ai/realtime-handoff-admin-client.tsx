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
import { markStaffRepliesReadAction } from "@/features/guest-ai-concierge/read-receipts-actions";

/**
 * V9M — admin realtime client for the handoff detail page.
 *
 * Subscribes to `/dashboard/guest-ai/handoffs/[id]/stream`,
 * dedupes events, debounces a `markStaffRepliesReadAction` whenever
 * a guest reply lands, and `router.refresh()`-es so the parent
 * server component re-renders.
 */
export interface RealtimeHandoffAdminClientProps {
  handoffId: string;
}

type ConnectionState =
  | { kind: "idle" }
  | { kind: "unsupported" }
  | { kind: "connecting" }
  | { kind: "live" }
  | { kind: "reconnecting" }
  | { kind: "error"; message: string };

export function RealtimeHandoffAdminClient({
  handoffId,
}: RealtimeHandoffAdminClientProps) {
  const router = useRouter();
  const [conn, setConn] = useState<ConnectionState>({ kind: "idle" });

  const dedupeRef = useRef(makeDedupe(512));
  const readGateRef = useRef(makeReadReceiptGate(2_000));

  useEffect(() => {
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

    const url = `/dashboard/guest-ai/handoffs/${encodeURIComponent(
      handoffId,
    )}/stream`;
    setConn({ kind: "connecting" });
    const es = new EventSource(url);

    es.addEventListener("open", () => setConn({ kind: "live" }));
    es.addEventListener("error", () =>
      setConn({ kind: "reconnecting" }),
    );

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
        case "reply_created": {
          scheduleRefresh();
          // If the new reply is from the guest, debounce a
          // staff-side mark-read.
          const author = (event.payload as { authorType?: string })
            .authorType;
          if (author === "guest" && readGateRef.current.shouldEmit()) {
            const fd = new FormData();
            fd.append("handoffId", handoffId);
            void markStaffRepliesReadAction(null, fd).catch(() => {
              /* best-effort */
            });
          }
          return;
        }
        case "handoff_status_changed":
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
  }, [handoffId, router]);

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
          Live updates aren&apos;t supported in this browser. Refresh
          manually.
        </span>
      )}
      {conn.kind === "error" && <span>{conn.message}</span>}
    </div>
  );
}
