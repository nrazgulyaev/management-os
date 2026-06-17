"use client";

/**
 * Privacy + AI controls for a sales conversation thread. Consent is the
 * hard gate: `recordConsent` (grant/revoke) toggles
 * `consent_to_analyze`; `triggerConversationAnalysis` is only offered
 * once consent is granted (the server action rejects it otherwise). Both
 * are org-scoped server actions; we router.refresh on success so the
 * status badges re-render.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  recordConsent,
  triggerConversationAnalysis,
} from "@/lib/development/server/conversation-review/conversation-actions";

export function ConsentControl({
  threadCode,
  userId,
  consented,
  aiStatus,
}: {
  threadCode: string;
  userId: string;
  consented: boolean;
  aiStatus: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function setConsent(consent: boolean) {
    setErr(null);
    start(async () => {
      const r = await recordConsent({ threadCode, userId, consent });
      if (!r.ok) {
        setErr(r.error ?? "Could not record consent.");
        return;
      }
      router.refresh();
    });
  }

  function analyze() {
    setErr(null);
    start(async () => {
      const r = await triggerConversationAnalysis({ threadCode });
      if (!r.ok) {
        setErr(r.error ?? "Analysis failed.");
        return;
      }
      router.refresh();
    });
  }

  const analyzing = aiStatus === "analyzing";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {consented ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConsent(false)}
            className="btn btn-secondary btn-sm"
          >
            {pending ? "Working…" : "Revoke consent"}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConsent(true)}
            className="btn btn-dark btn-sm"
          >
            {pending ? "Working…" : "Grant analysis consent"}
          </button>
        )}

        {consented && (
          <button
            type="button"
            disabled={pending || analyzing}
            onClick={analyze}
            className="btn btn-amber btn-sm"
          >
            {analyzing
              ? "Analyzing…"
              : pending
                ? "Working…"
                : "Trigger AI analysis"}
          </button>
        )}
      </div>
      {!consented && (
        <p className="text-xs text-ink-tertiary leading-relaxed">
          AI analysis is gated on explicit operator-recorded consent. Grant
          consent above to enable it.
        </p>
      )}
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
