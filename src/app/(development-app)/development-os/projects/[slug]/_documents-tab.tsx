"use client";

/**
 * Project Documents tab — lists documents indexed against this project and an
 * attach/record control. Reuses the existing `documents` table via the
 * co-located org-scoped server actions. Real bytes live in Supabase Storage;
 * operators attach an already-uploaded object by bucket/path, or record a
 * reference document.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import {
  createProjectDocumentAction,
  archiveProjectDocumentAction,
} from "./_document-actions";
import type { ProjectDocumentRow } from "@/lib/development/server/documents/project-documents-queries";

const DOCUMENT_TYPES = [
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

const VISIBILITIES = ["internal", "owner", "guest", "public"] as const;

const TYPE_TONE: Record<string, "info" | "ok" | "warn" | "soft"> = {
  contract: "info",
  certificate: "ok",
  policy: "warn",
};

export function ProjectDocumentsTab({
  projectId,
  slug,
  documents,
}: {
  projectId: string;
  slug: string;
  documents: ProjectDocumentRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState("");
  const [documentType, setDocumentType] =
    React.useState<(typeof DOCUMENT_TYPES)[number]>("contract");
  const [visibility, setVisibility] =
    React.useState<(typeof VISIBILITIES)[number]>("internal");
  const [fileName, setFileName] = React.useState("");
  const [storageBucket, setStorageBucket] = React.useState("");
  const [storagePath, setStoragePath] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    start(async () => {
      const res = await createProjectDocumentAction({
        projectId,
        slug,
        title: title.trim(),
        documentType,
        visibility,
        fileName: fileName.trim() || undefined,
        storageBucket: storageBucket.trim() || undefined,
        storagePath: storagePath.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitle("");
      setFileName("");
      setStorageBucket("");
      setStoragePath("");
      setOpen(false);
      router.refresh();
    });
  }

  function archive(documentId: string) {
    setError(null);
    start(async () => {
      const res = await archiveProjectDocumentAction({ documentId, slug });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        {open ? (
          <form
            onSubmit={submit}
            className="rounded border border-line-soft bg-surface p-3 space-y-3 max-w-2xl"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block text-sm md:col-span-2">
                <span className="text-ink-secondary">Title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Main construction contract — Cluster A"
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Type</span>
                <select
                  value={documentType}
                  onChange={(e) =>
                    setDocumentType(
                      e.target.value as (typeof DOCUMENT_TYPES)[number],
                    )
                  }
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Visibility</span>
                <select
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value as (typeof VISIBILITIES)[number])
                  }
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                >
                  {VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">File name (optional)</span>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Storage bucket (optional)</span>
                <input
                  type="text"
                  value={storageBucket}
                  onChange={(e) => setStorageBucket(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-xs font-mono"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-ink-secondary">Storage path (optional)</span>
              <input
                type="text"
                value={storagePath}
                onChange={(e) => setStoragePath(e.target.value)}
                placeholder="project/<id>/contracts/main.pdf"
                className="mt-1 block w-full rounded border border-line-soft p-2 text-xs font-mono"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="btn btn-dark btn-sm"
              >
                {pending ? "Saving…" : "Attach document"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              {error && <span className="text-xs text-danger">{error}</span>}
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn btn-dark btn-sm"
            >
              + Attach document
            </button>
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        )}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents indexed against this project"
          description="Attach a contract, permit, drawing, or certificate. Documents indexed here are scoped to this project."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Title</TH>
              <TH>Type</TH>
              <TH>Visibility</TH>
              <TH>File</TH>
              <TH>Added</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {documents.map((d) => (
              <TR key={d.id}>
                <TD className="text-sm">{d.title}</TD>
                <TD>
                  <HandoffBadge tone={TYPE_TONE[d.documentType] ?? "soft"}>
                    {d.documentType}
                  </HandoffBadge>
                </TD>
                <TD className="text-xs">{d.visibility}</TD>
                <TD className="text-xs font-mono">{d.fileName ?? "—"}</TD>
                <TD className="text-xs">{d.createdAt}</TD>
                <TD>
                  <HandoffBadge tone={d.status === "active" ? "ok" : "soft"}>
                    {d.status}
                  </HandoffBadge>
                </TD>
                <TD>
                  {d.status === "active" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => archive(d.id)}
                      className="text-[11px] px-2 py-0.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
                    >
                      Archive
                    </button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
