"use client";

/**
 * Wave A wiring (Functional-Depth Audit §3.1) — drawing revision lifecycle
 * buttons. transitionDrawingRevision is a DB-enforced FSM (draft → for_review
 * → approved → issued_for_construction → superseded, with single-IFC
 * supersession) that existed server-side but had ZERO UI triggers on the
 * drawing detail. This wires the allowed transitions per revision status.
 *
 * The NEXT map mirrors VALID_NEXT in drawing-actions.ts so we only show legal
 * buttons; the server re-validates the transition (and enforces single-IFC),
 * so this is a UX guard, not the authority.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transitionDrawingRevision } from "@/lib/development/server/drawings/drawing-actions";

type RevStatus =
  | "draft"
  | "for_review"
  | "rejected"
  | "approved"
  | "issued_for_construction"
  | "superseded";

const NEXT: Record<string, string[]> = {
  draft: ["for_review", "rejected"],
  for_review: ["approved", "rejected", "draft"],
  approved: ["issued_for_construction", "rejected"],
  issued_for_construction: ["superseded"],
  superseded: [],
  rejected: ["draft"],
};

const META: Record<
  string,
  { label: string; primary?: boolean; danger?: boolean; confirm?: string }
> = {
  for_review: { label: "Submit for review", primary: true },
  approved: { label: "Approve", primary: true },
  issued_for_construction: {
    label: "Issue for construction",
    primary: true,
    confirm:
      "Issue this revision for construction? Any existing IFC revision on this drawing will be superseded.",
  },
  superseded: { label: "Supersede", confirm: "Mark this revision as superseded?" },
  rejected: { label: "Reject", danger: true, confirm: "Reject this revision?" },
  draft: { label: "Return to draft" },
};

export function RevisionActions({
  revisionId,
  status,
}: {
  revisionId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const next = NEXT[status] ?? [];
  if (next.length === 0) {
    return <span className="text-ink-tertiary text-xs">—</span>;
  }

  function run(to: string) {
    const m = META[to];
    if (m?.confirm && !confirm(m.confirm)) return;
    setErr(null);
    start(async () => {
      try {
        await transitionDrawingRevision({ revisionId, to: to as RevStatus });
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Transition failed.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {next.map((to) => {
        const m = META[to] ?? { label: to };
        const cls = m.danger
          ? "border-danger/40 text-danger hover:bg-danger/5"
          : m.primary
            ? "border-ink/30 text-ink hover:bg-muted/50"
            : "border-line-soft text-ink-secondary hover:bg-muted/40";
        return (
          <button
            key={to}
            type="button"
            disabled={pending}
            onClick={() => run(to)}
            className={`text-[11px] px-2 py-0.5 rounded border bg-surface disabled:opacity-50 ${cls}`}
          >
            {pending ? "…" : m.label}
          </button>
        );
      })}
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}
