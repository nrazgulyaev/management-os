"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  testPaymentConnectionAction,
  disconnectPaymentConnectionAction,
} from "@/lib/payment-processors/connection-actions";
import { ConfirmDialog } from "@/components/ui/primitives";

interface Props {
  connectionId: string;
  status: string;
}

/**
 * Stage 10.E.7 — replaced the bespoke `window.prompt()` reason
 * capture with the standard <ConfirmDialog> from the 10.D primitives.
 * Disconnect is destructive (kills active payment intents); the modal
 * gives a consistent confirm UX with the rest of the codebase.
 */
export function PaymentConnectionActions({ connectionId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  if (isArchived) {
    return (
      <span className="text-xs text-stone-500">
        Connection archived — create a fresh one to reconnect.
      </span>
    );
  }

  return (
    <>
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
          onClick={() => setConfirmOpen(true)}
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
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={async () => {
          await new Promise<void>((resolve, reject) => {
            startTransition(async () => {
              const r = await disconnectPaymentConnectionAction({
                connectionId,
              });
              if (!r.ok) {
                setMessage({ kind: "err", text: r.error });
                reject(new Error(r.error));
                return;
              }
              router.push("/dashboard/payments/providers");
              router.refresh();
              resolve();
            });
          });
        }}
        title="Disconnect payment processor?"
        description="Active payment intents tied to this connection will fail. Webhooks may also stop arriving."
        confirmLabel="Disconnect"
        tone="destructive"
        warning="Re-connecting requires re-pasting the provider credentials."
      />
    </>
  );
}
