"use client";

/**
 * Risk alert lifecycle + mitigation verbs (P1 exec drill-in).
 *
 * Lifecycle (acknowledge / resolve / markFalsePositive) already existed.
 * This adds the design's mitigation context:
 *   - Issue RFQ to vendors  → deep-links the procurement PR-create flow
 *   - Lock price / advance order → records the decision (audit-logged)
 *   - Brief board → append a board brief to the alert notes (audit-logged)
 *   - Mitigation-plan editor → persists onto the alert's notes column
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  acknowledgeAlert,
  setInvestigating,
  resolveAlert,
  markFalsePositive,
} from "@/lib/development/server/risk-radar/risk-radar-actions";
import {
  saveMitigationPlan,
  briefBoard,
  lockPriceAdvanceOrder,
} from "@/lib/development/server/risk-radar/risk-radar-mitigation-actions";

const OPEN_LIKE = ["open", "acknowledged", "investigating"];

type ActionResult = { ok: boolean; error?: string };

export function AlertActions({
  alertCode,
  status,
  userId,
  initialPlan,
  rfqProjectId,
}: {
  alertCode: string;
  status: string;
  userId: string;
  initialPlan: string | null;
  rfqProjectId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [briefOpen, setBriefOpen] = React.useState(false);
  const [lockOpen, setLockOpen] = React.useState(false);

  function run(p: Promise<ActionResult>) {
    setErr(null);
    start(async () => {
      const r = await p;
      if (!r.ok) {
        setErr(r.error ?? "Action failed.");
        return;
      }
      router.refresh();
    });
  }

  const isOpenLike = OPEN_LIKE.includes(status);

  const btn =
    "text-xs px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";
  const dangerBtn =
    "text-xs px-3 py-1.5 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  const rfqHref = rfqProjectId
    ? `/development-os/procurement/purchase-requests/new?projectId=${encodeURIComponent(rfqProjectId)}`
    : "/development-os/procurement/purchase-requests/new";

  return (
    <div className="flex flex-col gap-5">
      {/* Mitigation verbs — available regardless of lifecycle status */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={rfqHref}>
            <Send className="w-4 h-4" strokeWidth={1.75} />
            Issue RFQ to vendors
          </Link>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => setLockOpen(true)}
        >
          <Lock className="w-4 h-4" strokeWidth={1.75} />
          Lock price / advance order
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => setBriefOpen(true)}
        >
          <FileText className="w-4 h-4" strokeWidth={1.75} />
          Brief board
        </Button>
      </div>

      {/* Mitigation-plan editor — persisted onto the alert's notes */}
      <MitigationPlanEditor
        alertCode={alertCode}
        initialPlan={initialPlan}
        pending={pending}
        onSave={(plan) => run(saveMitigationPlan({ alertCode, plan }))}
      />

      {/* Lifecycle controls */}
      {isOpenLike && (
        <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
          <div className="text-xs font-medium text-ink-secondary uppercase tracking-wide">
            Lifecycle
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status === "open" && (
              <button
                type="button"
                className={btn}
                disabled={pending}
                onClick={() => run(acknowledgeAlert({ alertCode, userId }))}
              >
                Acknowledge
              </button>
            )}
            {status !== "investigating" && (
              <button
                type="button"
                className={btn}
                disabled={pending}
                onClick={() => run(setInvestigating({ alertCode, userId }))}
              >
                Investigating
              </button>
            )}
          </div>
          <form
            className="flex flex-col gap-2 max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              const notes =
                (new FormData(e.currentTarget).get("resolutionNotes") ?? "")
                  .toString()
                  .trim() || undefined;
              run(resolveAlert({ alertCode, userId, resolutionNotes: notes }));
            }}
          >
            <textarea
              name="resolutionNotes"
              rows={2}
              placeholder="Resolution notes (optional)"
              className="w-full rounded border border-line-soft bg-surface px-2 py-1.5 text-sm"
            />
            <div className="flex items-center gap-2">
              <button type="submit" className={btn} disabled={pending}>
                {pending ? "…" : "Resolve"}
              </button>
              <button
                type="button"
                className={dangerBtn}
                disabled={pending}
                onClick={(e) => {
                  const form =
                    (e.currentTarget.closest("form") as HTMLFormElement) ??
                    null;
                  const notes = form
                    ? (new FormData(form).get("resolutionNotes") ?? "")
                        .toString()
                        .trim() || undefined
                    : undefined;
                  run(
                    markFalsePositive({ alertCode, userId, resolutionNotes: notes }),
                  );
                }}
              >
                Mark false positive
              </button>
            </div>
          </form>
        </div>
      )}

      {err && <span className="text-xs text-danger">{err}</span>}

      <BriefBoardModal
        open={briefOpen}
        onOpenChange={setBriefOpen}
        pending={pending}
        onSubmit={(brief) =>
          run(
            briefBoard({ alertCode, brief }).then((r) => {
              if (r.ok) setBriefOpen(false);
              return r;
            }),
          )
        }
      />

      <LockPriceModal
        open={lockOpen}
        onOpenChange={setLockOpen}
        pending={pending}
        onSubmit={(note) =>
          run(
            lockPriceAdvanceOrder({ alertCode, note }).then((r) => {
              if (r.ok) setLockOpen(false);
              return r;
            }),
          )
        }
      />
    </div>
  );
}

function MitigationPlanEditor({
  alertCode,
  initialPlan,
  pending,
  onSave,
}: {
  alertCode: string;
  initialPlan: string | null;
  pending: boolean;
  onSave: (plan: string) => void;
}) {
  const [value, setValue] = React.useState(initialPlan ?? "");
  const dirty = value !== (initialPlan ?? "");
  return (
    <div className="flex flex-col gap-2 max-w-xl">
      <div className="text-xs font-medium text-ink-secondary uppercase tracking-wide">
        Mitigation plan
      </div>
      <textarea
        name="mitigationPlan"
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Steps, owners, and timeline to mitigate this risk…"
        className="w-full rounded border border-line-soft bg-surface px-2 py-1.5 text-sm"
        aria-label={`Mitigation plan for ${alertCode}`}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={pending || !dirty}
          onClick={() => onSave(value)}
        >
          {pending ? "Saving…" : "Save plan"}
        </Button>
        {dirty && (
          <button
            type="button"
            className="text-xs text-ink-secondary hover:underline"
            onClick={() => setValue(initialPlan ?? "")}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function BriefBoardModal({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: boolean;
  onSubmit: (brief: string) => void;
}) {
  const [brief, setBrief] = React.useState("");
  React.useEffect(() => {
    if (!open) setBrief("");
  }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={brief.length > 0}>
      <ModalHeader
        title="Brief the board"
        description="Compose a short brief about this risk. It is appended to the alert's mitigation notes and logged to the audit trail so leadership has a record."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <textarea
          rows={6}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="What the board needs to know, the ask, and the recommended decision…"
          className="w-full rounded border border-line-soft bg-surface px-2 py-1.5 text-sm"
          aria-label="Board brief"
        />
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={pending || brief.trim().length < 3}
          onClick={() => onSubmit(brief)}
        >
          {pending ? "Recording…" : "Record brief"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function LockPriceModal({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: boolean;
  onSubmit: (note: string | undefined) => void;
}) {
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (!open) setNote("");
  }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={note.length > 0}>
      <ModalHeader
        title="Lock price / advance order"
        description="Record a decision to lock the current price or advance the order to hedge this risk. Raise the actual PO via the RFQ flow."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Vendor, quantity, price ceiling, or rationale (optional)…"
          className="w-full rounded border border-line-soft bg-surface px-2 py-1.5 text-sm"
          aria-label="Lock price note"
        />
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() => onSubmit(note.trim() || undefined)}
        >
          {pending ? "Recording…" : "Record decision"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
