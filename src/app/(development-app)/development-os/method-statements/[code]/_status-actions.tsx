"use client";

/**
 * Wire-up (dev-OS engineering-doc lifecycles §1) — method-statement status
 * transition buttons. `transitionMethodStatement` is a DB-enforced FSM
 * (draft → under_review → approved → active → superseded/archived) that
 * existed server-side but had ZERO UI triggers on the detail page, so a
 * method statement could never be approved or activated.
 *
 * The NEXT map mirrors VALID_NEXT in method-statement-actions.ts so we only
 * render legal buttons; the server re-validates the transition, so this is a
 * UX guard, not the authority. Pattern cloned from drawings/[code]/
 * _revision-actions.tsx.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transitionMethodStatement } from "@/lib/development/server/method-statements/method-statement-actions";

type MsStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "active"
  | "superseded"
  | "archived";

const NEXT: Record<string, MsStatus[]> = {
  draft: ["under_review", "archived"],
  under_review: ["approved", "draft", "archived"],
  approved: ["active", "draft"],
  active: ["superseded", "archived"],
  superseded: [],
  archived: [],
};

const META: Record<
  string,
  { label: string; primary?: boolean; danger?: boolean; confirm?: string }
> = {
  under_review: { label: "Submit for review", primary: true },
  approved: { label: "Approve", primary: true },
  active: {
    label: "Activate",
    primary: true,
    confirm: "Activate this method statement? It becomes the live SOP.",
  },
  superseded: {
    label: "Supersede",
    confirm: "Mark this method statement as superseded?",
  },
  archived: { label: "Archive", danger: true, confirm: "Archive this method statement?" },
  draft: { label: "Return to draft" },
};

export function MethodStatementStatusActions({
  methodId,
  status,
}: {
  methodId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const next = NEXT[status] ?? [];
  if (next.length === 0) {
    return (
      <span className="text-ink-tertiary text-xs">
        {status} is terminal — no further transitions.
      </span>
    );
  }

  function run(to: MsStatus) {
    const m = META[to];
    if (m?.confirm && !confirm(m.confirm)) return;
    setErr(null);
    start(async () => {
      try {
        await transitionMethodStatement({ methodId, to });
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
