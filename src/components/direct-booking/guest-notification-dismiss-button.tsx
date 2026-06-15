"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guestArchiveNotificationAction } from "@/features/direct-booking/guest-status-actions";

/**
 * Guest-side "Dismiss" control for a single status-page notification.
 * Calls the `"use server"` archive action by hold token + notification id;
 * the page's `archived` filter then hides the item on the next render.
 */
export function GuestNotificationDismissButton({
  token,
  notificationId,
}: {
  token: string;
  notificationId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="self-start">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const out = await guestArchiveNotificationAction(
              token,
              notificationId,
            );
            if (out.ok) {
              router.refresh();
            } else {
              setError(out.reason ?? "Could not dismiss.");
            }
          });
        }}
        className="text-[11px] text-ink-tertiary hover:text-ink underline-offset-4 hover:underline disabled:opacity-50"
      >
        {pending ? "Dismissing…" : "Dismiss"}
      </button>
      {error && <span className="ml-2 text-[11px] text-danger">{error}</span>}
    </div>
  );
}
