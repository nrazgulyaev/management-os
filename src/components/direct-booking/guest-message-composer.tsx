"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { guestReplyToBookingThreadAction } from "@/features/direct-booking/guest-status-actions";

export function GuestMessageComposer({
  token,
  disabled,
  disabledReason,
}: {
  token: string;
  disabled: boolean;
  disabledReason: string | null;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (disabled) {
    return (
      <div className="rounded-md border border-line-soft bg-muted/40 p-4 text-xs text-ink-tertiary">
        {disabledReason ??
          "Messaging is not available for this booking request."}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        const text = body.trim();
        if (text.length < 2) {
          setError("Please write a short message.");
          return;
        }
        startTransition(async () => {
          const out = await guestReplyToBookingThreadAction(token, text);
          if (out.ok) {
            setBody("");
            setSuccess(
              "Thanks — our concierge team has been notified.",
            );
          } else {
            const reason = out.reason ?? "unknown";
            if (reason === "rate_limited") {
              setError(
                "You have sent a few messages recently. Please try again in a little while.",
              );
            } else if (reason === "messaging_disabled") {
              setError("Messaging is disabled for this booking.");
            } else if (reason === "thread_closed") {
              setError("This conversation is closed.");
            } else if (reason.startsWith("invalid_body")) {
              setError("Please write a longer message.");
            } else {
              setError("We could not send your message just now.");
            }
          }
        });
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type a message to our concierge team…"
        className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
        maxLength={4000}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      {success && <p className="text-xs text-success">{success}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send message to concierge"}
      </Button>
    </form>
  );
}
