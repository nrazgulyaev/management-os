"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  feedDocumentToAgentAction,
  removeDocumentFromAgentAction,
} from "@/app/(dashboard)/dashboard/documents/ai-knowledge-actions";
import type {
  DocAgentAssignment,
  OrgAgentOption,
} from "@/app/(dashboard)/dashboard/documents/ai-knowledge-queries";
import { getDocumentAiFeedStateAction } from "./documents-ai-feed-actions";

/**
 * DOCS-AI-FEED — doc-scoped "Feed to an AI agent" modal (Documents Live
 * mock, ✨ row action + preview-pane action). Same real pipeline as the
 * page-level AI-knowledge panel: feed / remove run through
 * `ai-knowledge-actions.ts` (org-safe RAG ingestion + audit + aiFedAt
 * flag); agents and current assignments load on open via
 * `getDocumentAiFeedStateAction`.
 */

export interface AiFeedDoc {
  id: string;
  title: string;
  mimeType: string | null;
  hasFile: boolean;
}

/** Mirrors the panel's extractable set — full-text vs metadata card. */
const EXTRACTABLE_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

type LoadedState = {
  envReady: boolean;
  agents: OrgAgentOption[];
  assignments: DocAgentAssignment[];
};

export function DocumentAiFeedModal({
  doc,
  open,
  onOpenChange,
}: {
  doc: AiFeedDoc;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<LoadedState | null>(null);
  const [agentId, setAgentId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [removingAgentId, setRemovingAgentId] = React.useState<string | null>(
    null,
  );

  const load = React.useCallback(() => {
    setLoading(true);
    setLoadError(null);
    getDocumentAiFeedStateAction(doc.id)
      .then((r) => {
        if (r.ok) {
          setState({
            envReady: r.envReady,
            agents: r.agents,
            assignments: r.assignments,
          });
        } else {
          setLoadError(r.error);
        }
      })
      .catch(() => setLoadError("Couldn't load the AI agents."))
      .finally(() => setLoading(false));
  }, [doc.id]);

  React.useEffect(() => {
    if (open) {
      setAgentId(null);
      setError(null);
      setState(null);
      load();
    }
  }, [open, load]);

  const extractable = doc.hasFile && EXTRACTABLE_MIMES.has(doc.mimeType ?? "");
  const canFeed =
    !!state && state.envReady && state.agents.length > 0 && !!agentId;

  function feed() {
    if (!agentId || !state) return;
    setError(null);
    startTransition(async () => {
      const r = await feedDocumentToAgentAction({
        documentId: doc.id,
        agentId,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  }

  function remove(a: DocAgentAssignment) {
    setError(null);
    setRemovingAgentId(a.agentId);
    startTransition(async () => {
      const r = await removeDocumentFromAgentAction({
        documentId: doc.id,
        agentId: a.agentId,
      });
      setRemovingAgentId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      load();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      ariaLabel="Feed document to an AI agent"
    >
      <ModalHeader
        title="Feed to an AI agent"
        description={`“${doc.title}” becomes part of the agent's knowledge base — it can cite it when answering.`}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody className="flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-ink-tertiary">Loading agents…</p>
        ) : loadError ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-xs text-danger" role="alert">
              {loadError}
            </p>
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : state ? (
          <>
            {!state.envReady && (
              <p className="rounded-md border border-warning/40 bg-warning-weak/40 px-4 py-3 text-[13px] text-ink-secondary">
                Document ingestion is paused — the platform embedding key
                (OPENAI_API_KEY) isn&apos;t configured yet. Existing knowledge
                stays available and can still be removed.
              </p>
            )}

            {state.agents.length === 0 ? (
              <p className="rounded-md border border-line-soft bg-surface px-5 py-6 text-center text-sm text-ink-tertiary">
                No AI agents are enabled for this workspace yet. Once your
                platform admin switches one on in Agent Studio, you can feed
                this document to it from here.
              </p>
            ) : (
              <>
                <p className="text-xs text-ink-tertiary">
                  {extractable
                    ? "PDF, DOCX and text files are read in full."
                    : doc.hasFile
                      ? `This file type (${doc.mimeType ?? "unknown"}) can't be read in full yet — the agent gets a metadata card (title, category, link, dates).`
                      : "No file is attached — the agent gets a metadata card (title, category, link, dates)."}
                </p>

                <div className="flex flex-col gap-2">
                  {state.agents.map((a) => {
                    const current = state.assignments.find(
                      (x) => x.agentId === a.id,
                    );
                    if (current) {
                      return (
                        <div
                          key={a.id}
                          className="flex w-full items-center gap-3 rounded-md border border-terra/40 bg-accent-weak/40 px-3.5 py-2.5"
                        >
                          <span className="text-terra" aria-hidden>
                            ✦
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">
                              {a.displayName}
                            </span>
                            <span className="mono mt-0.5 block truncate text-[10.5px] text-ink-tertiary">
                              {current.mode === "file"
                                ? "full text ingested"
                                : "metadata card only"}
                            </span>
                          </span>
                          {current.processingStatus === "ready" ? (
                            <Badge tone="success">ready</Badge>
                          ) : current.processingStatus === "failed" ? (
                            <Badge
                              tone="danger"
                              title={current.processingError ?? undefined}
                            >
                              failed
                            </Badge>
                          ) : (
                            <Badge tone="warning">processing…</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger-weak"
                            disabled={pending}
                            onClick={() => remove(current)}
                          >
                            {pending && removingAgentId === a.id
                              ? "Removing…"
                              : "Remove"}
                          </Button>
                        </div>
                      );
                    }
                    const isSelected = agentId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAgentId(a.id)}
                        aria-pressed={isSelected}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md border bg-surface px-3.5 py-2.5 text-left transition-colors",
                          isSelected
                            ? "border-terra ring-2 ring-terra/25"
                            : "border-line hover:bg-muted/50",
                        )}
                      >
                        <span className="text-terra" aria-hidden>
                          ✦
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">
                            {a.displayName}
                          </span>
                          {a.description && (
                            <span className="mt-0.5 block truncate text-xs text-ink-tertiary">
                              {a.description}
                            </span>
                          )}
                        </span>
                        <span className="mono shrink-0 text-[10.5px] text-ink-tertiary">
                          {a.docCount} {a.docCount === 1 ? "doc" : "docs"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {error && (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          variant="accent"
          size="sm"
          disabled={!canFeed || pending}
          title={
            state && !state.envReady
              ? "Ingestion is paused until the embedding key is configured."
              : !agentId
                ? "Pick an agent first."
                : undefined
          }
          onClick={feed}
        >
          {pending && !removingAgentId ? "Feeding…" : "Feed to agent"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
