"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  testPaymentConnectionAction,
  disconnectPaymentConnectionAction,
} from "@/lib/payment-processors/connection-actions";

interface Props {
  connectionId: string;
  status: string;
}

export function PaymentConnectionActions({ connectionId, status }: Props) {
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
      const r = await testPaymentConnectionAction({ connectionId });
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

  const runDisconnect = () => {
    setMessage(null);
    const reason = window.prompt(
      "Disconnect this payment processor? Optional reason:",
      "",
    );
    if (reason === null) return;
    startTransition(async () => {
      const r = await disconnectPaymentConnectionAction({
        connectionId,
        reason: reason.trim() || undefined,
      });
      if (!r.ok) {
        setMessage({ kind: "err", text: r.error });
        return;
      }
      router.push("/dashboard/payments/providers");
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
