"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, Archive, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  testChannelConnection,
  triggerManualReservationsPull,
  updateChannelConnectionStatus,
} from "@/lib/channel-manager/actions";
import type { ChannelConnectionStatus } from "@/lib/db/schema/channel-manager";

/**
 * Stage 6.P1.E.2 — Action buttons on the Connection detail Overview tab.
 *
 * Each action is a thin client wrapper around a server action. After
 * the action runs we router.refresh() so the server-rendered detail
 * page picks up the new state without a full reload.
 *
 * Two-click confirm on archive — accidental archive of an active
 * channel manager connection would silently break inventory sync.
 */

export function ConnectionActions({
  connectionId,
  status,
}: {
  connectionId: string;
  status: ChannelConnectionStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  function flash(kind: "ok" | "err", text: string) {
    if (kind === "ok") {
      setMessage(text);
      setError(null);
    } else {
      setError(text);
      setMessage(null);
    }
  }

  function runTest() {
    flash("ok", "");
    startTransition(async () => {
      const result = await testChannelConnection(connectionId);
      if (result.connected) {
        flash("ok", "Connection test passed.");
      } else {
        flash(
          "err",
          `Connection test failed: ${truncate(JSON.stringify(result.details), 200)}`,
        );
      }
      router.refresh();
    });
  }

  function runManualPull() {
    flash("ok", "");
    startTransition(async () => {
      const result = await triggerManualReservationsPull(connectionId);
      if (result.error) {
        flash("err", result.error);
      } else {
        flash(
          "ok",
          `Pulled ${result.recordsProcessed} reservation${result.recordsProcessed === 1 ? "" : "s"}.`,
        );
      }
      router.refresh();
    });
  }

  function setStatus(next: ChannelConnectionStatus) {
    flash("ok", "");
    startTransition(async () => {
      const result = await updateChannelConnectionStatus({
        connectionId,
        status: next,
        archiveReason:
          next === "archived" ? archiveReason.trim() || "Operator request" : undefined,
      });
      if (!result.ok) {
        flash("err", result.error ?? "Status update failed");
      } else {
        flash("ok", `Status set to ${next}.`);
        setConfirmArchive(false);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={runTest}
          disabled={pending}
          data-testid="action-test-connection"
        >
          {pending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Wifi className="w-3 h-3" />
          )}
          <span className="ml-1">Test connection</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={runManualPull}
          disabled={pending || status !== "active"}
          data-testid="action-manual-pull"
        >
          Pull reservations now
        </Button>
        {status === "active" && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setStatus("paused")}
            disabled={pending}
            data-testid="action-pause"
          >
            <Pause className="w-3 h-3" />
            <span className="ml-1">Pause</span>
          </Button>
        )}
        {status === "paused" && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setStatus("active")}
            disabled={pending}
            data-testid="action-resume"
          >
            <Play className="w-3 h-3" />
            <span className="ml-1">Resume</span>
          </Button>
        )}
        {status !== "archived" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!confirmArchive) {
                setConfirmArchive(true);
                return;
              }
              setStatus("archived");
            }}
            disabled={pending}
            data-testid="action-archive"
          >
            <Archive className="w-3 h-3" />
            <span className="ml-1">
              {confirmArchive ? "Confirm archive" : "Archive"}
            </span>
          </Button>
        )}
      </div>

      {confirmArchive && status !== "archived" && (
        <div className="rounded-md border border-danger/40 bg-danger/5 p-3 space-y-2">
          <p className="text-xs">
            Archiving stops all syncs immediately. Add a reason so future
            audits know why.
          </p>
          <input
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
            data-testid="archive-reason-input"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirmArchive(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
