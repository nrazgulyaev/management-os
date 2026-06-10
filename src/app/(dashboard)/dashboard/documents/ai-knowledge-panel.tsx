"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
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
} from "./ai-knowledge-actions";
import type {
  DocAgentAssignment,
  OrgAgentOption,
} from "./ai-knowledge-queries";

/**
 * DOCS-AI-FEED — "Feed to AI agent" panel from the Documents Live mock.
 * Pick an agent, feed a document into its knowledge base (real
 * ingestion through the platform RAG pipeline), see per-agent doc
 * counts and per-document "AI · agent" badges, remove again.
 */

export interface PanelDoc {
  id: string;
  title: string;
  documentType: string;
  fileName: string | null;
  mimeType: string | null;
  hasFile: boolean;
}

const EXTRACTABLE_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

const PROCESSING_STATUSES = new Set(["pending", "chunking", "embedding"]);

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function isExtractable(doc: PanelDoc): boolean {
  return doc.hasFile && EXTRACTABLE_MIMES.has(doc.mimeType ?? "");
}

export function AiKnowledgePanel({
  docs,
  agents,
  assignments,
  envReady,
}: {
  docs: PanelDoc[];
  agents: OrgAgentOption[];
  assignments: DocAgentAssignment[];
  envReady: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const docById = React.useMemo(
    () => new Map(docs.map((d) => [d.id, d])),
    [docs],
  );

  // Light refresh poll while any ingestion is still running, so the
  // status badges move from "processing" to "ready" without a manual
  // reload. Capped so a stuck pipeline never refreshes forever.
  const hasProcessing = assignments.some((a) =>
    PROCESSING_STATUSES.has(a.processingStatus),
  );
  const pollCount = React.useRef(0);
  React.useEffect(() => {
    if (!hasProcessing) {
      pollCount.current = 0;
      return;
    }
    const t = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current > 30) {
        clearInterval(t);
        return;
      }
      router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [hasProcessing, router]);

  function remove(a: DocAgentAssignment) {
    setError(null);
    setNotice(null);
    setRemovingId(a.knowledgeDocumentId);
    startTransition(async () => {
      const r = await removeDocumentFromAgentAction({
        documentId: a.documentId,
        agentId: a.agentId,
      });
      setRemovingId(null);
      if (!r.ok) setError(r.error);
      else {
        setNotice(`Removed from ${a.agentName}'s knowledge base.`);
        router.refresh();
      }
    });
  }

  const canFeed = agents.length > 0 && docs.length > 0 && envReady;

  return (
    <section className="flex flex-col gap-4" aria-label="AI knowledge">
      <h3 className="flex items-baseline gap-2.5 text-display text-[22px] font-normal text-ink">
        AI knowledge
        <span className="italic font-normal text-terra">
          · feed documents to your agents
        </span>
        <span className="ml-auto mono text-[10px] uppercase tracking-wide text-ink-tertiary">
          {assignments.length} fed
        </span>
      </h3>

      {!envReady && (
        <p className="rounded-md border border-warning/40 bg-warning-weak/40 px-4 py-3 text-[13px] text-ink-secondary">
          Document ingestion is paused — the platform embedding key
          (OPENAI_API_KEY) isn&apos;t configured yet. Existing knowledge stays
          available; new documents can be fed once the key is set.
        </p>
      )}

      {agents.length === 0 ? (
        <div className="rounded-md border border-line-soft bg-surface px-5 py-8 text-center">
          <p className="text-sm text-ink-tertiary">
            No AI agents are enabled for this workspace yet. Once your platform
            admin switches one on in Agent Studio, you can feed contracts,
            permits and tax records to it right from here.
          </p>
        </div>
      ) : (
        <>
          {/* Agents with their workspace-doc counts */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-md border border-line bg-surface px-3.5 py-3"
              >
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-weak text-display text-base text-terra"
                  aria-hidden
                >
                  ✦
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {a.displayName}
                  </span>
                  <span className="mono mt-0.5 block truncate text-[10.5px] text-ink-tertiary">
                    {a.agentCode}
                  </span>
                </span>
                <span className="mono shrink-0 text-right text-[11px] leading-tight text-ink-secondary">
                  {a.docCount}
                  <span className="block text-[9.5px] text-ink-tertiary">
                    {a.docCount === 1 ? "doc" : "docs"}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {(error || notice) && (
            <p
              className={cn(
                "text-xs",
                error ? "text-danger" : "text-success",
              )}
              role={error ? "alert" : "status"}
            >
              {error ?? notice}
            </p>
          )}

          {/* Current assignments */}
          {assignments.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-soft bg-surface px-4 py-4">
              <p className="text-sm text-ink-tertiary">
                Nothing fed yet. Feed a contract, permit or tax PDF and the
                agent can cite it in its answers.
              </p>
              <Button
                variant="accent"
                size="sm"
                disabled={!canFeed}
                title={
                  !envReady
                    ? "Ingestion is paused until the embedding key is configured."
                    : docs.length === 0
                      ? "Add a document first."
                      : undefined
                }
                onClick={() => setOpen(true)}
              >
                Feed a document
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-cream-warm px-4 py-2.5">
                <span className="mono text-[9.5px] uppercase tracking-wide text-ink-tertiary">
                  in agent knowledge bases
                </span>
                <Button
                  variant="accent"
                  size="sm"
                  disabled={!canFeed}
                  title={
                    !envReady
                      ? "Ingestion is paused until the embedding key is configured."
                      : docs.length === 0
                        ? "Add a document first."
                        : undefined
                  }
                  onClick={() => setOpen(true)}
                >
                  Feed a document
                </Button>
              </div>
              {assignments.map((a) => {
                const doc = docById.get(a.documentId);
                const processing = PROCESSING_STATUSES.has(a.processingStatus);
                return (
                  <div
                    key={a.knowledgeDocumentId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line-soft px-4 py-3 last:border-0"
                  >
                    <span className="min-w-0 flex-1 basis-52">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {doc?.title ?? a.filename}
                      </span>
                      <span className="mono mt-0.5 block truncate text-[10.5px] text-ink-tertiary">
                        {a.mode === "file"
                          ? "full text ingested"
                          : "metadata card only — file type not readable yet"}
                        {" · "}
                        {fmt(a.uploadedAt)}
                      </span>
                    </span>
                    <Badge tone="accent">AI · {a.agentName}</Badge>
                    {a.processingStatus === "ready" ? (
                      <Badge tone="success">
                        ready · {a.chunkCount}{" "}
                        {a.chunkCount === 1 ? "chunk" : "chunks"}
                      </Badge>
                    ) : a.processingStatus === "failed" ? (
                      <Badge
                        tone="danger"
                        title={a.processingError ?? undefined}
                      >
                        failed
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        {processing ? "processing…" : a.processingStatus}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger-weak"
                      disabled={pending && removingId === a.knowledgeDocumentId}
                      onClick={() => remove(a)}
                    >
                      {pending && removingId === a.knowledgeDocumentId
                        ? "Removing…"
                        : "Remove"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <FeedModal
        open={open}
        onOpenChange={setOpen}
        docs={docs}
        agents={agents}
        assignments={assignments}
        onDone={(message) => {
          setError(null);
          setNotice(message);
          router.refresh();
        }}
      />
    </section>
  );
}

function FeedModal({
  open,
  onOpenChange,
  docs,
  agents,
  assignments,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docs: PanelDoc[];
  agents: OrgAgentOption[];
  assignments: DocAgentAssignment[];
  onDone: (message: string) => void;
}) {
  const [docId, setDocId] = React.useState("");
  const [agentId, setAgentId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const selectedDoc = docs.find((d) => d.id === docId) ?? null;
  const assignedAgentIds = new Set(
    assignments.filter((a) => a.documentId === docId).map((a) => a.agentId),
  );
  const alreadyAssigned = agentId !== null && assignedAgentIds.has(agentId);

  function reset() {
    setDocId("");
    setAgentId(null);
    setError(null);
  }

  function submit() {
    if (!selectedDoc || !agentId || alreadyAssigned) return;
    setError(null);
    startTransition(async () => {
      const r = await feedDocumentToAgentAction({
        documentId: selectedDoc.id,
        agentId,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOpenChange(false);
      reset();
      onDone(
        r.mode === "metadata"
          ? `Fed to ${r.agentName ?? "the agent"} as a metadata card — the file type can't be read in full yet.`
          : `Fed to ${r.agentName ?? "the agent"} — processing the full text now.`,
      );
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      size="md"
      ariaLabel="Feed a document to an AI agent"
    >
      <ModalHeader
        title="Feed to an AI agent"
        description="The document becomes part of the agent's knowledge base — it can cite it when answering."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody className="flex flex-col gap-3">
        <Field
          label="Document"
          htmlFor="ai-feed-doc"
          help={
            selectedDoc && !isExtractable(selectedDoc)
              ? selectedDoc.hasFile
                ? `This file type (${selectedDoc.mimeType ?? "unknown"}) can't be read in full yet — we'll feed a metadata card (title, category, link, dates) so the agent knows it exists.`
                : "No file is attached — we'll feed a metadata card (title, category, link, dates)."
              : "PDF, DOCX and text files are read in full."
          }
        >
          <Select
            id="ai-feed-doc"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
          >
            <option value="">Pick a document…</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
                {isExtractable(d) ? "" : " (metadata only)"}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Agent">
          <div className="flex flex-col gap-2">
            {agents.map((a) => {
              const isCurrent = assignedAgentIds.has(a.id);
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
                  {isCurrent && docId ? (
                    <Badge tone="accent">current</Badge>
                  ) : (
                    <span className="mono shrink-0 text-[10.5px] text-ink-tertiary">
                      {a.docCount} {a.docCount === 1 ? "doc" : "docs"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Field>

        {alreadyAssigned && (
          <p className="text-xs text-ink-tertiary">
            This document is already in that agent&apos;s knowledge base — pick
            another agent, or remove it from the list below first.
          </p>
        )}
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
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
          disabled={!selectedDoc || !agentId || alreadyAssigned || pending}
          onClick={submit}
        >
          {pending ? "Feeding…" : "Feed to agent"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
