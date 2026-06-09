"use client";

/**
 * W3 RFI loop — respond + resolve panel (detail view).
 *
 * Drives the RFI status FSM (open → answered → closed) from the detail page:
 *   - "open"     shows the answer composer (respondToRfi) + a direct close.
 *   - "answered" shows the recorded answer + a "Mark resolved" close.
 *   - "closed"   is read-only.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  respondToRfi,
  transitionRfi,
} from "@/lib/development/server/rfis/rfi-actions";
import type { RfiStatus } from "@/features/development/rfi/rfi-routing";

const STATUS_TONE: Record<RfiStatus, "warning" | "info" | "success"> = {
  open: "warning",
  answered: "info",
  closed: "success",
};

export function RfiRespondPanel({
  rfiId,
  projectSlug,
  status,
  existingResponse,
}: {
  rfiId: string;
  projectSlug: string;
  status: RfiStatus;
  existingResponse: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(existingResponse ?? "");
  const [error, setError] = useState<string | null>(null);

  function submitResponse() {
    setError(null);
    if (!draft.trim()) {
      setError("Write an answer before saving.");
      return;
    }
    startTransition(async () => {
      try {
        await respondToRfi({ rfiId, projectSlug, responseText: draft.trim() });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save response");
      }
    });
  }

  function close() {
    setError(null);
    startTransition(async () => {
      try {
        if (draft.trim() && draft.trim() !== (existingResponse ?? "")) {
          await respondToRfi({ rfiId, projectSlug, responseText: draft.trim() });
        }
        await transitionRfi({ rfiId, projectSlug, to: "closed" });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to close RFI");
      }
    });
  }

  if (status === "closed") {
    return (
      <div className="space-y-2">
        <Badge tone={STATUS_TONE.closed}>closed</Badge>
        <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
          {existingResponse ?? "No answer was recorded before closing."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <Badge tone={STATUS_TONE[status]}>{status}</Badge>
      <label className="block text-sm">
        <span className="text-ink-secondary">Answer</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder="Document the design / engineering answer. Saving marks the RFI answered."
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <Button onClick={submitResponse} disabled={pending}>
          {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {status === "answered" ? "Update answer" : "Save answer"}
        </Button>
        <Button variant="secondary" onClick={close} disabled={pending}>
          {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Mark resolved
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
