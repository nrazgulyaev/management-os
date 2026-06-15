"use client";

/**
 * Wire-up — BOQ status state-machine controls. transitionBoqStatus existed
 * (server-only) with no UI caller. Buttons are gated by the document's
 * current status, mirroring cashflow-forecast/_controls.tsx.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { transitionBoqStatusAction } from "./_actions";

type BoqStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "tender"
  | "awarded"
  | "superseded"
  | "archived";

export function BoqStatusControls({
  boqDocumentId,
  boqCode,
  status,
}: {
  boqDocumentId: string;
  boqCode: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function go(to: BoqStatus) {
    setErr(null);
    start(async () => {
      const r = await transitionBoqStatusAction({ boqDocumentId, boqCode, to });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      router.refresh();
    });
  }

  // Build the allowed transitions from the current status. The action
  // accepts any target in its enum; the gating below reflects the QS
  // workflow (draft → review → approved → tender → awarded).
  const transitions: { to: BoqStatus; label: string }[] = [];
  switch (status) {
    case "draft":
      transitions.push({ to: "under_review", label: "Submit for review" });
      break;
    case "under_review":
      transitions.push({ to: "approved", label: "Approve" });
      transitions.push({ to: "draft", label: "Return to draft" });
      break;
    case "approved":
      transitions.push({ to: "tender", label: "Send to tender" });
      break;
    case "tender":
      transitions.push({ to: "awarded", label: "Mark awarded" });
      break;
    default:
      break;
  }

  if (transitions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {transitions.map((t) => (
        <button
          key={t.to}
          type="button"
          disabled={pending}
          onClick={() => go(t.to)}
          className="btn btn-dark btn-sm disabled:opacity-50"
        >
          {t.label}
        </button>
      ))}
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
