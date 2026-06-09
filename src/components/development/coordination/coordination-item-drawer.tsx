"use client";

/**
 * Coordination item drawer — reply thread + approve/close, in a Modal.
 *
 * Loads the thread lazily on open via a server action, posts replies, and
 * drives the lifecycle:
 *   - RFI       → "Mark answered" / "Close"
 *   - Submittal → FSM next-states (Approve / Approve as noted / Revise & resubmit
 *                 / Reject / Close)
 *   - Defect    → lifecycle is read-only here (managed in the QA/QC cabinet);
 *                 the thread still works so coordination notes stay together.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Link2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import {
  KIND_LABEL,
  nextSubmittalStatuses,
  isSubmittalApproved,
  type CoordinationItemSummary,
  type SubmittalStatus,
} from "@/features/development/coordination/coordination-model";
import {
  postCoordinationReply,
  transitionCoordinationItem,
  fetchCoordinationThread,
  fetchGatedRequests,
  fetchLinkableRequests,
  linkSubmittalGate,
} from "@/lib/development/server/coordination/coordination-actions";
import type {
  CoordinationThreadMessage,
  GatedRequestSummary,
  LinkableRequest,
} from "@/lib/development/server/coordination/coordination-actions";

const SUBMITTAL_ACTION_LABEL: Record<string, string> = {
  under_review: "Send to review",
  approved: "Approve",
  approved_as_noted: "Approve as noted",
  revise_resubmit: "Revise & resubmit",
  rejected: "Reject",
  closed: "Close",
  submitted: "Mark submitted",
};

function fmt(d: Date | string): string {
  return new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function CoordinationItemDrawer({
  item,
  onClose,
}: {
  item: CoordinationItemSummary;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<CoordinationThreadMessage[] | null>(
    null,
  );
  const [reply, setReply] = useState("");

  useEffect(() => {
    let active = true;
    fetchCoordinationThread({ kind: item.kind, id: item.id })
      .then((rows) => {
        if (active) setMessages(rows);
      })
      .catch(() => {
        if (active) setMessages([]);
      });
    return () => {
      active = false;
    };
  }, [item.kind, item.id]);

  function sendReply() {
    if (!reply.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await postCoordinationReply({
          itemKind: item.kind,
          itemId: item.id,
          body: reply.trim(),
        });
        setReply("");
        const rows = await fetchCoordinationThread({ kind: item.kind, id: item.id });
        setMessages(rows);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to post reply");
      }
    });
  }

  function transition(to: string) {
    setError(null);
    startTransition(async () => {
      try {
        await transitionCoordinationItem({
          itemKind: item.kind,
          itemId: item.id,
          to,
        });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transition failed");
      }
    });
  }

  // Lifecycle actions per kind.
  let actions: { to: string; label: string; variant?: "primary" | "secondary" | "destructive" }[] = [];
  if (item.kind === "rfi") {
    if (item.status === "open") {
      actions = [
        { to: "answered", label: "Mark answered", variant: "secondary" },
        { to: "closed", label: "Close RFI", variant: "primary" },
      ];
    } else if (item.status === "answered") {
      actions = [{ to: "closed", label: "Close RFI", variant: "primary" }];
    }
  } else if (item.kind === "submittal") {
    actions = nextSubmittalStatuses(
      item.status as Parameters<typeof nextSubmittalStatuses>[0],
    ).map((to) => ({
      to,
      label: SUBMITTAL_ACTION_LABEL[to] ?? to,
      variant:
        to === "rejected"
          ? ("destructive" as const)
          : to === "approved" || to === "approved_as_noted"
            ? ("primary" as const)
            : ("secondary" as const),
    }));
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" ariaLabel="Coordination item">
      <ModalHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm">{item.ref}</span>
            <Badge tone="outline">{KIND_LABEL[item.kind]}</Badge>
            <Badge tone={item.statusTone}>{item.status}</Badge>
          </span>
        }
        description={item.title}
        onClose={onClose}
      />
      <ModalBody>
        <div className="space-y-4">
          {/* Thread */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
              Reply thread
            </div>
            {messages === null ? (
              <div className="flex items-center gap-2 text-sm text-ink-tertiary">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-ink-tertiary">
                No replies yet. Start the conversation below.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-lg border border-line-soft bg-surface px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink">
                        {m.authorName ?? "Team member"}
                      </span>
                      <span className="text-[10px] text-ink-tertiary tabular-nums">
                        {fmt(m.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
                      {m.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Composer */}
          <div className="flex items-start gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="Write a reply…"
              className="flex-1 rounded border border-line-soft p-2 text-sm"
            />
            <Button onClick={sendReply} disabled={pending || !reply.trim()}>
              {pending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" strokeWidth={1.75} />
              )}
            </Button>
          </div>

          {item.kind === "submittal" && (
            <SubmittalGatePanel
              submittalId={item.id}
              status={item.status as SubmittalStatus}
            />
          )}

          {item.kind === "defect" && (
            <p className="text-xs text-ink-tertiary">
              Defect lifecycle (open → accepted → closed) is managed in the
              QA/QC cabinet. This thread keeps coordination notes alongside the
              drawing pin.
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
        {actions.length === 0 ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          actions.map((a) => (
            <Button
              key={a.to}
              variant={a.variant ?? "secondary"}
              onClick={() => transition(a.to)}
              disabled={pending}
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {a.label}
            </Button>
          ))
        )}
      </ModalFooter>
    </Modal>
  );
}

/**
 * SUBMITTAL → PROCUREMENT gate panel. Shows the purchase requests gated on
 * this submittal (and whether the gate is currently open), and lets an
 * operator link another PR to gate on it. The gate's authoritative enforcement
 * lives in transitionPurchaseRequest; this panel is the cross-cabinet surface.
 */
function SubmittalGatePanel({
  submittalId,
  status,
}: {
  submittalId: string;
  status: SubmittalStatus;
}) {
  const [gated, setGated] = useState<GatedRequestSummary[] | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkable, setLinkable] = useState<LinkableRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const approved = isSubmittalApproved(status);

  function reload() {
    fetchGatedRequests({ submittalId })
      .then(setGated)
      .catch(() => setGated([]));
  }

  useEffect(() => {
    let active = true;
    fetchGatedRequests({ submittalId })
      .then((rows) => active && setGated(rows))
      .catch(() => active && setGated([]));
    return () => {
      active = false;
    };
  }, [submittalId]);

  function openLink() {
    setError(null);
    setLinkOpen(true);
    setLinkable(null);
    fetchLinkableRequests({ submittalId })
      .then(setLinkable)
      .catch(() => setLinkable([]));
  }

  function link(requestId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await linkSubmittalGate({ submittalId, requestId });
        setLinkOpen(false);
        reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to link request");
      }
    });
  }

  return (
    <div className="rounded-lg border border-line-soft bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {approved ? (
            <Unlock className="w-4 h-4 text-success" strokeWidth={1.75} />
          ) : (
            <Lock className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
          )}
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Procurement gate
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={openLink} disabled={pending}>
          <Link2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          Gate a request
        </Button>
      </div>

      <p className="mt-1 text-xs text-ink-tertiary">
        {approved
          ? "Approved — gated purchase requests below are released to proceed to PO."
          : "Until this submittal is approved, gated purchase requests are blocked from selecting a quote or creating a PO."}
      </p>

      {gated === null ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-ink-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : gated.length === 0 ? (
        <p className="mt-2 text-xs text-ink-tertiary">
          No purchase requests are gated on this submittal yet.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {gated.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded border border-line-soft px-2 py-1.5"
            >
              <span className="font-mono text-[11px] text-ink-tertiary">
                {r.requestCode}
              </span>
              <span className="text-sm text-ink truncate">{r.materialName}</span>
              <Badge tone={r.unblocked ? "success" : "warning"}>
                {r.unblocked ? "released" : "blocked"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <Modal
        open={linkOpen}
        onOpenChange={(o) => !o && setLinkOpen(false)}
        size="md"
        ariaLabel="Gate a purchase request"
      >
        <ModalHeader
          title="Gate a purchase request"
          description="Link a purchase request so it cannot proceed to PO until this submittal is approved."
          onClose={() => setLinkOpen(false)}
        />
        <ModalBody>
          {linkable === null ? (
            <div className="flex items-center gap-2 text-sm text-ink-tertiary">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading requests…
            </div>
          ) : linkable.length === 0 ? (
            <p className="text-sm text-ink-tertiary">
              No purchase requests on this project yet. Create one in the
              Procurement cabinet first.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
              {linkable.map((r) => {
                const alreadyHere = r.gatedBySubmittalId === submittalId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => !alreadyHere && link(r.id)}
                      disabled={pending || alreadyHere}
                      className="w-full text-left rounded-lg border border-line-soft bg-surface hover:bg-muted disabled:opacity-60 transition-colors px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-ink-tertiary">
                          {r.requestCode}
                        </span>
                        <Badge tone="outline">{r.status.replace(/_/g, " ")}</Badge>
                        {alreadyHere && <Badge tone="success">gated here</Badge>}
                        {r.gatedBySubmittalId && !alreadyHere && (
                          <Badge tone="warning">gated elsewhere</Badge>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-ink truncate">
                        {r.materialName}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setLinkOpen(false)}>
            Done
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
