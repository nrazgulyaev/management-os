"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createDocumentAction,
  type CreateDocumentResult,
} from "@/features/documents/actions";
import { feedDocumentToAgentAction } from "../ai-knowledge-actions";

const DOC_TYPES = [
  "contract",
  "invoice",
  "receipt",
  "photo",
  "statement",
  "kyc",
  "certificate",
  "guide",
  "policy",
  "other",
] as const;

const ENTITY_TYPES = [
  "project",
  "villa",
  "owner",
  "booking",
  "supplier",
  "task",
  "maintenance",
] as const;

/** Org-enabled AI agent the new document can optionally be fed to. */
export interface DocumentFormAgentOption {
  id: string;
  displayName: string;
}

export function DocumentForm({
  agents = [],
  onSuccess,
  onCancel,
}: {
  /** Org-visible AI agents (empty / omitted hides the feed select). */
  agents?: DocumentFormAgentOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
} = {}) {
  const router = useRouter();
  const [state, setState] = React.useState<CreateDocumentResult | null>(null);
  const [done, setDone] = React.useState<{
    tone: "success" | "warning";
    message: string;
  } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  /** Navigate exactly as the old redirect-based flow did. */
  function finish() {
    if (onSuccess) onSuccess();
    else router.push("/dashboard/documents");
  }

  function submitAction(formData: FormData) {
    startTransition(async () => {
      setState(null);
      const agentId = String(formData.get("feedAgentId") ?? "");
      const result = await createDocumentAction(null, formData);
      if (!result.ok) {
        setState(result);
        return;
      }
      if (!agentId) {
        // Plain path — same navigation as before the AI follow-up existed.
        finish();
        return;
      }
      // Optional follow-up: feed the new document to the chosen agent.
      // A feed failure must never fail the upload — partial success.
      const agentName =
        agents.find((a) => a.id === agentId)?.displayName ?? "the agent";
      try {
        const fed = await feedDocumentToAgentAction({
          documentId: result.id,
          agentId,
        });
        if (fed.ok) {
          setDone({
            tone: "success",
            message:
              fed.mode === "metadata"
                ? `Document created and fed to ${fed.agentName ?? agentName} as a metadata card — this file type can't be read in full yet.`
                : `Document created and fed to ${fed.agentName ?? agentName} — ingestion started, the full text is being processed now.`,
          });
        } else {
          setDone({
            tone: "warning",
            message: `Document created, but feeding it to ${agentName} failed: ${fed.error} You can feed it from the AI knowledge panel on the documents page.`,
          });
        }
      } catch {
        setDone({
          tone: "warning",
          message: `Document created, but feeding it to ${agentName} didn't go through. You can feed it from the AI knowledge panel on the documents page.`,
        });
      }
    });
  }

  if (done) {
    return (
      <div className="card p-5 flex flex-col gap-4 max-w-[760px]">
        <h2 className="display text-[20px] font-normal">
          {done.tone === "success"
            ? "Document created"
            : "Document created — AI feed pending"}
        </h2>
        <p
          className={
            done.tone === "success"
              ? "rounded-md border border-success/30 bg-success-weak/40 px-4 py-2.5 text-sm text-ink"
              : "rounded-md border border-warning/40 bg-warning-weak/40 px-4 py-2.5 text-sm text-ink"
          }
          role="status"
        >
          {done.message}
        </p>
        <div className="flex justify-end">
          <button type="button" className="btn btn-accent" onClick={finish}>
            {onSuccess ? "Done" : "Go to documents"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={submitAction} className="flex flex-col gap-5 max-w-[760px]">
      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
          {state.error}
        </div>
      )}

      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h2 className="display text-[20px] font-normal">Document metadata</h2>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-3 ml-auto">
            records metadata only
          </span>
        </div>

        <label className="field">
          <span className="field-label">
            Title <span className="text-terra">*</span>
          </span>
          <input
            name="title"
            required
            className="input"
            placeholder="Eternal Villas — Management agreement"
          />
          {errs.title?.[0] && (
            <span className="field-error">{errs.title[0]}</span>
          )}
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="field">
            <span className="field-label">
              Document type <span className="text-terra">*</span>
            </span>
            <select name="documentType" defaultValue="contract" className="select">
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {errs.documentType?.[0] && (
              <span className="field-error">{errs.documentType[0]}</span>
            )}
          </label>
          <label className="field">
            <span className="field-label">
              Entity type <span className="text-terra">*</span>
            </span>
            <select name="entityType" defaultValue="project" className="select">
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {errs.entityType?.[0] && (
              <span className="field-error">{errs.entityType[0]}</span>
            )}
          </label>
          <label className="field">
            <span className="field-label">
              Entity ID (uuid) <span className="text-terra">*</span>
            </span>
            <input
              name="entityId"
              required
              className="input"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
            {errs.entityId?.[0] && (
              <span className="field-error">{errs.entityId[0]}</span>
            )}
          </label>
        </div>
      </div>

      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h2 className="display text-[20px] font-normal">Storage</h2>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-3 ml-auto">
            optional · file upload lands in v3
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="field">
            <span className="field-label">Storage bucket</span>
            <input name="storageBucket" className="input" placeholder="documents" />
          </label>
          <label className="field">
            <span className="field-label">Storage path</span>
            <input
              name="storagePath"
              className="input"
              placeholder="contracts/eternal-2024.pdf"
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">File name</span>
          <input name="fileName" className="input" />
        </label>
      </div>

      <div className="card p-5 flex flex-col gap-4">
        <h2 className="display text-[20px] font-normal">Access</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="field">
            <span className="field-label">
              Visibility <span className="text-terra">*</span>
            </span>
            <select name="visibility" defaultValue="internal" className="select">
              <option value="internal">Internal</option>
              <option value="owner">Owner</option>
              <option value="guest">Guest</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">
              Status <span className="text-terra">*</span>
            </span>
            <select name="status" defaultValue="active" className="select">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
      </div>

      {agents.length > 0 && (
        <div className="card p-5 flex flex-col gap-4">
          <div className="flex items-baseline gap-2">
            <h2 className="display text-[20px] font-normal">AI knowledge</h2>
            <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-3 ml-auto">
              optional
            </span>
          </div>
          <label className="field">
            <span className="field-label">Feed to AI agent</span>
            <select name="feedAgentId" defaultValue="" className="select">
              <option value="">Don&apos;t feed — store the document only</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-3">
              After the document is created it joins the agent&apos;s knowledge
              base, so the agent can cite it when answering. You can also feed
              or remove it later from the documents page.
            </span>
          </label>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        ) : (
          <Link href="/dashboard/documents" className="btn btn-secondary">
            Cancel
          </Link>
        )}
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? "Saving…" : "Create document"}
        </button>
      </div>
    </form>
  );
}
