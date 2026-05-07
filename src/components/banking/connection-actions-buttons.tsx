"use client";

/**
 * Stage 7.F.B.3 — Banking connection detail-page action buttons.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  testBankConnectionAction,
  disconnectBankConnectionAction,
  syncBankConnectionNowAction,
} from "@/lib/banking/connection-actions";

interface Props {
  connectionId: string;
  status: string;
  provider: string;
}

export function BankConnectionActions({
  connectionId,
  status,
  provider,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    kind: "ok" | "warn" | "err";
    text: string;
  } | null>(null);

  const isArchived = status === "archived";
  // Manual / Mandiri / BCA don't support upstream sync — they're CSV-only.
  const supportsAutoSync =
    provider !== "manual" && provider !== "mandiri" && provider !== "bca";

  const runTest = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await testBankConnectionAction({ connectionId });
      if (!r.ok) {
        setMessage({ kind: "err", text: r.error });
        return;
      }
      setMessage({
        kind: r.connected ? "ok" : "warn",
        text: r.connected
          ? "Connection verified ✓"
          : "Test returned negative.",
      });
      router.refresh();
    });
  };

  const runSync = () => {
    setMessage(null);
    if (
      !confirm("Pull transactions now? Cron normally runs at the configured cadence.")
    ) {
      return;
    }
    startTransition(async () => {
      const r = await syncBankConnectionNowAction({ connectionId });
      if (!r.ok) {
        setMessage({ kind: "err", text: r.error });
        return;
      }
      setMessage({
        kind: "ok",
        text: `Sync complete. ${r.transactionsPulled} new transactions.`,
      });
      router.refresh();
    });
  };

  const runDisconnect = () => {
    setMessage(null);
    const reason = window.prompt("Disconnect this bank connection? Optional reason:", "");
    if (reason === null) return;
    startTransition(async () => {
      const r = await disconnectBankConnectionAction({
        connectionId,
        reason: reason.trim() || undefined,
      });
      if (!r.ok) {
        setMessage({ kind: "err", text: r.error });
        return;
      }
      router.push("/development-os/banking");
      router.refresh();
    });
  };

  if (isArchived) {
    return (
      <span className="text-xs text-stone-500">
        Connection archived — create a fresh one to reconnect.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {supportsAutoSync && (
        <>
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
        </>
      )}
      {!supportsAutoSync && (
        <span className="text-xs text-stone-500">
          {provider === "manual"
            ? "Manual account — transactions land via CSV upload."
            : "CSV-only provider — upload statements via /finance/transactions."}
        </span>
      )}
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
