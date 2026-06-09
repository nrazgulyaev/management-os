"use client";

/**
 * Sales Pipeline Kanban — drag-a-card-between-columns view of the lead funnel.
 *
 * Columns are the existing lead-funnel stages; cards are leads (contact_roles
 * with role='lead'). Dragging a card to another column calls the guarded,
 * org-scoped `moveLeadStage` server action which enforces the FSM (no skipping
 * stages) and audit-logs the move. We optimistically move the card, then revert
 * + surface an inline error if the action rejects the transition.
 *
 * Reuses the @/components/ui/primitives KanbanBoard primitive (HTML5 DnD) and
 * the cream/stone/ink Layer-B tokens. It does NOT introduce a new pipeline
 * table — it persists straight onto contact_roles.status.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  KanbanBoard,
  type KanbanCard,
  type KanbanColumn,
} from "@/components/ui/primitives/kanban-board";
import { EmptyState } from "@/components/ui/empty-state";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import {
  LEAD_STATUS_LABEL,
  type LeadStatus,
} from "@/lib/development/server/leads-constants";
import {
  isValidLeadTransition,
  leadTransitionError,
} from "@/lib/development/server/lead-stage-machine";
import { moveLeadStage } from "@/lib/development/server/lead-actions";
import type { LeadListItem } from "@/lib/development/types/sales";

/**
 * Columns shown on the board. Mirrors the funnel order; `cold` is kept out of
 * the default board to reduce noise (the list view + filters still surface it).
 */
const BOARD_COLUMNS: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "viewing_scheduled",
  "viewing_completed",
  "negotiation",
  "reservation",
  "contract_pending",
  "contract_signed",
  "lost",
];

function hoursSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, (Date.now() - then) / 3_600_000);
}

export interface LeadKanbanBoardProps {
  leads: LeadListItem[];
  pendingDraftsByRoleId: Record<string, number>;
}

export function LeadKanbanBoard({
  leads,
  pendingDraftsByRoleId,
}: LeadKanbanBoardProps) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  // Local stage overrides for optimistic drag. roleId → stage.
  const [overrides, setOverrides] = React.useState<Record<string, LeadStatus>>(
    {},
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Reset overrides whenever fresh server data arrives.
  React.useEffect(() => {
    setOverrides({});
  }, [leads]);

  const stageOf = React.useCallback(
    (lead: LeadListItem): LeadStatus | null => {
      const raw = overrides[lead.roleId] ?? lead.status;
      return (BOARD_COLUMNS as readonly string[]).includes(raw)
        ? (raw as LeadStatus)
        : null;
    },
    [overrides],
  );

  const columns = React.useMemo<KanbanColumn[]>(
    () =>
      BOARD_COLUMNS.map((s) => ({
        id: s,
        label: LEAD_STATUS_LABEL[s],
      })),
    [],
  );

  const cards = React.useMemo<KanbanCard[]>(() => {
    const out: KanbanCard[] = [];
    for (const lead of leads) {
      const stage = stageOf(lead);
      if (!stage) continue;
      const pending = pendingDraftsByRoleId[lead.roleId] ?? 0;
      const subtitleParts: string[] = [];
      if (lead.projectName) subtitleParts.push(lead.projectName);
      if (lead.email || lead.phone)
        subtitleParts.push((lead.email ?? lead.phone) as string);
      out.push({
        id: lead.roleId,
        columnId: stage,
        title: lead.fullName,
        subtitle: subtitleParts.join(" · ") || undefined,
        ageHours: hoursSince(lead.startedAt),
        badge:
          pending > 0
            ? { label: `${pending} AI`, tone: "info" }
            : lead.agentDisplayName
              ? { label: lead.agentDisplayName, tone: "neutral" }
              : undefined,
      });
    }
    return out;
  }, [leads, stageOf, pendingDraftsByRoleId]);

  const leadByRoleId = React.useMemo(() => {
    const m = new Map<string, LeadListItem>();
    for (const l of leads) m.set(l.roleId, l);
    return m;
  }, [leads]);

  function handleMove(cardId: string, toColumnId: string) {
    setError(null);
    const lead = leadByRoleId.get(cardId);
    if (!lead) return;
    const from = stageOf(lead);
    const to = toColumnId as LeadStatus;
    if (!from || from === to) return;

    // Client-side guard mirrors the server FSM so an illegal drop never even
    // hits the action (and the card snaps back immediately).
    const guard = leadTransitionError(from, to);
    if (guard) {
      setError(guard);
      return;
    }

    // Optimistic move.
    setOverrides((prev) => ({ ...prev, [cardId]: to }));
    setBusy(true);
    startTransition(async () => {
      try {
        const res = await moveLeadStage({ contactRoleId: cardId, toStatus: to });
        if (!res.ok) {
          // Revert the optimistic move.
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[cardId];
            return next;
          });
          setError(res.error);
        } else {
          // Pull fresh data so metrics + ordering re-sync.
          router.refresh();
        }
      } catch {
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[cardId];
          return next;
        });
        setError("Something went wrong moving the lead. Please retry.");
      } finally {
        setBusy(false);
      }
    });
  }

  function handleCardClick(cardId: string) {
    router.push(`${DEVELOPMENT_APP_PATH}/sales/${cardId}`);
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        title="No leads in the pipeline yet."
        description="Create a lead to see it appear on the board. Drag cards between columns to advance the sales stage."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-ink-tertiary inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
          Drag a card to advance its stage. Moves are guarded — stages advance
          one step at a time and the change is audit-logged.
        </p>
        {busy && (
          <span className="text-xs text-ink-tertiary">Saving…</span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-sm border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink"
        >
          {error}
        </div>
      )}

      <KanbanBoard
        columns={columns}
        cards={cards}
        onCardMove={handleMove}
        onCardClick={handleCardClick}
        emptyColumnLabel="No leads"
      />
    </div>
  );
}

// Re-export the client-side guard so callers can pre-validate without importing
// the server-action module directly.
export { isValidLeadTransition };
