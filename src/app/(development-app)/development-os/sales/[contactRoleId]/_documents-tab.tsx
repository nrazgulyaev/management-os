"use client";

/**
 * Lead Documents tab — replaces the old ComingInPlaceholder.
 *
 * Lists every document indexed against this lead's CONTACT (entityType
 * 'contact', entityId = contactId — the durable key, since a lead promotes to
 * a buyer while the contact persists) and lets an operator upload ID / KYC /
 * signed reservation form / contract PDFs. Reuses the shared storage actions
 * (uploadDocumentAction + getDocumentSignedUrlAction) — the same writer the
 * bookings + owner surfaces use — so files land in Supabase Storage and a
 * scoped `documents` row is created. No new authority is added here.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import {
  uploadDocumentAction,
  getDocumentSignedUrlAction,
} from "@/features/storage/storage-actions";

export interface LeadDocumentDTO {
  id: string;
  title: string;
  documentType: string;
  fileName: string | null;
  sizeBytes: number | null;
  visibility: string;
  status: string;
  createdAt: string;
  hasFile: boolean;
}

const DOC_TYPES = [
  "kyc",
  "contract",
  "receipt",
  "invoice",
  "certificate",
  "other",
] as const;

function sizeLabel(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LeadDocumentsTab({
  contactId,
  documents,
}: {
  contactId: string;
  documents: LeadDocumentDTO[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="label">Documents · {documents.length}</div>
        <UploadLeadDocButton contactId={contactId} />
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents on this lead yet"
          description="Upload ID, KYC pack, the signed reservation form, or the contract — indexed against this lead's contact record."
        />
      ) : (
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          {documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-4 px-4 py-3 border-b border-line-soft last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink truncate">{d.title}</div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-tertiary mt-0.5">
                  {d.documentType}
                  {sizeLabel(d.sizeBytes) ? ` · ${sizeLabel(d.sizeBytes)}` : ""}
                  {` · ${new Date(d.createdAt).toLocaleDateString()}`}
                </div>
              </div>
              <HandoffBadge tone={d.visibility === "internal" || d.visibility === "operator_only" ? "soft" : "info"}>
                {d.visibility}
              </HandoffBadge>
              <DocViewButton documentId={d.id} hasFile={d.hasFile} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadLeadDocButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [docType, setDocType] = React.useState<string>("kyc");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("entityType", "contact");
    fd.set("entityId", contactId);
    fd.set("title", file.name);
    fd.set("documentType", docType);
    fd.set("visibility", "operator_only");
    start(async () => {
      const res = await uploadDocumentAction(fd);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Upload failed");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
        disabled={pending}
        className="rounded border border-line-soft bg-surface px-2 py-1 text-xs"
        aria-label="Document type"
      >
        {DOC_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={onPick}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        title={error ?? undefined}
      >
        {pending ? "Uploading…" : "Upload document"}
      </button>
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}

function DocViewButton({
  documentId,
  hasFile,
}: {
  documentId: string;
  hasFile: boolean;
}) {
  const [pending, start] = React.useTransition();

  if (!hasFile) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm opacity-50 cursor-not-allowed"
        disabled
        title="No stored file"
      >
        View
      </button>
    );
  }

  function open() {
    start(async () => {
      const res = await getDocumentSignedUrlAction(documentId);
      if (res.ok && res.signedUrl) {
        window.open(res.signedUrl, "_blank", "noopener");
      }
    });
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={open}
      disabled={pending}
    >
      {pending ? "…" : "View"}
    </button>
  );
}
