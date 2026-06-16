"use client";

/**
 * Stage 7.F.B.2 — Google Workspace connection client wrapper.
 *
 * Renders the Connect / Reconnect / Disconnect buttons. The
 * connect/reconnect flow is a simple <a href> to the OAuth start
 * route — no server action needed since it's a redirect chain.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGoogleConnectionAction } from "@/lib/google-workspace/connection-actions";

interface Props {
  connectionId: string | null;
  organizationId: string | null;
}

export function GoogleWorkspaceActions({
  connectionId,
  organizationId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onDisconnect = () => {
    if (!connectionId || !organizationId) return;
    if (
      !confirm(
        "Disconnect Google Workspace? Sync jobs will halt; existing data is preserved.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      setError(null);
      try {
        // TENANCY: only the connectionId is sent — the action derives the
        // org from the session, so the client-supplied org is never trusted.
        const res = await disconnectGoogleConnectionAction({ connectionId });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a
        href="/api/oauth/google-workspace/start"
        className="inline-block text-sm px-4 py-2 rounded bg-stone-900 text-white hover:bg-stone-700"
      >
        {connectionId ? "Reconnect Google" : "Connect Google Workspace"}
      </a>
      {connectionId && (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={pending}
          className="text-sm px-3 py-2 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {pending ? "…" : "Disconnect"}
        </button>
      )}
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </div>
  );
}
