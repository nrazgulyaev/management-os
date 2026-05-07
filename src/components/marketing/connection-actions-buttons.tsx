"use client";

/**
 * Stage 7.F.B.1 — Marketing connection detail-page action buttons.
 *
 * Test connection / Sync now / Disconnect — all gated client-side; the
 * server-side actions enforce permission via `requirePermission`.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  testMarketingConnectionAction,
  disconnectMarketingConnectionAction,
  syncMarketingConnectionNowAction,
} from "@/lib/marketing/connection-actions";

interface Props {
  connectionId: string;
  status: string;
}

export function MarketingConnectionActions({ connectionId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    kind: "ok" | "warn" | "err";
    text: string;
  } | null>(null);

  const isArchived = status === "archived";

  const runTest = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await testMarketingConnectionAction({ connectionId });
      if (!r.ok) {
        setMessage({ kind: "err", text: r.error });
        return;
      }
      setMessage({
        kind: r.connected ? "ok" : "warn",
        text: r.connected ? "Connection verified ✓" : "Test returned negative.",
      });
      router.refresh();
    });
  };

  const runSync = () => {
    setMessage(null);
    if (
      !confirm(
        "Pull campaigns from this connection now? Cron normally runs every 6h.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await syncMarketingConnectionNowAction({ connectionId });
      if (!r.ok) {
        setMessage({ kind: "err", text: r.error });
        return;
      }
      setMessage({
        kind: "ok",
        text: `Sync complete. Inserted ${r.inserted}, updated ${r.updated}, failed ${r.failed}.`,
      });
      router.refresh();
    });
  };

  const runDisconnect = () => {
    setMessage(null);
    const reason = window.prompt(
      "Disconnect this connection? Optional reason:",
      "",
    );
    if (reason === null) return; // user cancelled
    startTransition(async () => {
      const r = await disconnectMarketingConnectionAction({
        connectionId,
        reason: reason.trim() || undefined,
      });
      if (!r.ok) {
        setMessage({ kind: "err", text: r.error });
        return;
      }
      router.push("/development-os/marketing/connections");
      router.refresh();
    });
  };

  if (isArchived) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-500">
          Connection archived — create a fresh one to reconnect.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={runTest}
        disabled={pending}
        className="text-sm px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-50"
      >
        {pending ? "…" : "Test connection"}
      </button>
      <button
        type="button"
        onClick={runSync}
        disabled={pending || status !== "active"}
        title={
          status !== "active"
            ? "Connection must be active before syncing"
            : undefined
        }
        className="text-sm px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-50"
      >
        Sync now
      </button>
      <button
        type="button"
        onClick={runDisconnect}
        disabled={pending}
        className="text-sm px-3 py-1.5 rounded border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Disconnect
      </button>
      {message && (
        <span
          className={`text-xs ${
            message.kind === "err"
              ? "text-red-600"
              : message.kind === "warn"
                ? "text-amber-600"
                : "text-emerald-700"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
