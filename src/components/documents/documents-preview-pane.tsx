"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { DocAppRow } from "@/features/documents/app-services";
import {
  markDocumentSignedAction,
  setDocumentAiFedAction,
  deleteDocumentAppAction,
} from "@/features/documents/app-actions";
import { SignatureRequestButton } from "./documents-signature-modals";
import { VersionCompareButton } from "./documents-version-modals";

interface VersionRow {
  id: string;
  versionNo: number;
  title: string;
  fileName: string | null;
  sizeBytes: number | null;
  contentHash: string | null;
  changeNote: string | null;
  isCurrent: boolean;
  createdAt: string;
}

interface SignatureRow {
  id: string;
  signerName: string;
  signerEmail: string | null;
  signerRole: string;
  status: string;
  message: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  sentAt: string | null;
  signedAt: string | null;
  countersignedAt: string | null;
  createdAt: string;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function DocumentPreviewPane({
  doc,
  onClose,
}: {
  doc: DocAppRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [detail, setDetail] = React.useState<{
    versions: VersionRow[];
    signatures: SignatureRow[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    setDetail(null);
    fetch(`/api/documents/${doc.id}/detail`)
      .then((r) => (r.ok ? r.json() : { versions: [], signatures: [] }))
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setLoadingDetail(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail({ versions: [], signatures: [] });
          setLoadingDetail(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  const isSigned = !!doc.signedAt;
  const isFed = !!doc.aiFedAt;

  return (
    <Section variant="panel" className="!p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge tone="outline">{doc.documentType}</Badge>
            <Badge tone={doc.visibility === "internal" ? "neutral" : "gold"}>
              {doc.visibility}
            </Badge>
            {isFed && <Badge tone="accent">AI</Badge>}
          </div>
          <h3 className="text-base font-medium text-ink leading-snug break-words">
            {doc.title}
          </h3>
          <p className="text-xs text-ink-tertiary mt-1">
            {doc.entityType} · added {fmt(doc.createdAt)}
            {doc.expiresAt && (
              <>
                {" · "}
                <span
                  className={cn(
                    doc.expired
                      ? "text-danger"
                      : doc.expiringSoon
                        ? "text-warning"
                        : undefined,
                  )}
                >
                  {doc.expired ? "expired" : "expires"} {fmt(doc.expiresAt)}
                </span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="text-ink-tertiary hover:text-ink shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Preview surface */}
      <div className="rounded-md border border-line-soft bg-muted/30 px-4 py-8 text-center">
        {doc.hasFile ? (
          <div className="flex flex-col items-center gap-2">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-ink-tertiary">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-xs text-ink-secondary">{doc.fileName ?? "Attached file"}</p>
            <p className="text-[10px] text-ink-tertiary">{doc.mimeType ?? "file"}</p>
          </div>
        ) : (
          <p className="text-xs text-ink-tertiary">
            No file attached. Metadata-only record — upload lands with storage.
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {/* Primary actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          asChild={doc.hasFile}
          disabled={!doc.hasFile}
          title={doc.hasFile ? "Download file" : "No file attached"}
        >
          {doc.hasFile ? (
            <a href={`/api/documents/${doc.id}/download`} target="_blank" rel="noreferrer">
              Download
            </a>
          ) : (
            <span>Download</span>
          )}
        </Button>
        <Button
          variant={isSigned ? "ghost" : "primary"}
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => markDocumentSignedAction({ documentId: doc.id, signed: !isSigned }))
          }
        >
          {isSigned ? "Mark unsigned" : "Mark signed"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => setDocumentAiFedAction({ documentId: doc.id, fed: !isFed }))
          }
        >
          {isFed ? "Remove from AI" : "Feed to AI agent"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-weak"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </Button>
      </div>

      {/* Signature requests */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-label">E-signature</h4>
          <SignatureRequestButton documentId={doc.id} />
        </div>
        {loadingDetail ? (
          <p className="text-xs text-ink-tertiary">Loading…</p>
        ) : detail && detail.signatures.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {detail.signatures.map((s) => (
              <SignatureRequestItem key={s.id} sig={s} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-tertiary">
            No signature requested yet.
          </p>
        )}
      </div>

      {/* Versions */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-label">Versions</h4>
          <VersionCompareButton documentId={doc.id} versions={detail?.versions ?? []} />
        </div>
        {loadingDetail ? (
          <p className="text-xs text-ink-tertiary">Loading…</p>
        ) : detail && detail.versions.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {detail.versions.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-sm border border-line-soft px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-2">
                  <Badge tone={v.isCurrent ? "success" : "outline"}>v{v.versionNo}</Badge>
                  <span className="text-ink-secondary truncate">
                    {v.changeNote ?? v.title}
                  </span>
                </span>
                <span className="text-ink-tertiary shrink-0">{fmt(v.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-tertiary">
            Single version. Add a revision to enable compare.
          </p>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete document?"
        body={`“${doc.title}” and its versions / signature requests will be permanently removed.`}
        confirmLabel="Delete"
        intent="destructive"
        onConfirm={async () => {
          const r = await deleteDocumentAppAction({ documentId: doc.id });
          if (r.ok) {
            onClose();
            router.refresh();
          } else {
            setError(r.error);
          }
        }}
      />
    </Section>
  );
}

function SignatureRequestItem({ sig }: { sig: SignatureRow }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const settled = sig.status === "signed" || sig.status === "countersigned";

  return (
    <li className="rounded-sm border border-line-soft px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink font-medium truncate">{sig.signerName}</span>
        <Badge
          tone={
            sig.status === "countersigned" || sig.status === "signed"
              ? "success"
              : sig.status === "declined" || sig.status === "cancelled"
                ? "danger"
                : "warning"
          }
        >
          {sig.status}
        </Badge>
      </div>
      <p className="text-[11px] text-ink-tertiary">
        {sig.signerRole}
        {sig.signerEmail ? ` · ${sig.signerEmail}` : ""}
        {sig.reminderCount > 0 ? ` · ${sig.reminderCount} reminder(s)` : ""}
      </p>
      {error && (
        <p className="text-[11px] text-danger" role="alert">
          {error}
        </p>
      )}
      {!settled && (
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const { sendSignatureReminderAction } = await import(
                  "@/features/documents/app-actions"
                );
                const r = await sendSignatureReminderAction({ requestId: sig.id });
                if (!r.ok) setError(r.error);
                else router.refresh();
              });
            }}
          >
            Send reminder
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const { markCountersignedAction } = await import(
                  "@/features/documents/app-actions"
                );
                const r = await markCountersignedAction({ requestId: sig.id });
                if (!r.ok) setError(r.error);
                else router.refresh();
              });
            }}
          >
            Mark countersigned
          </Button>
        </div>
      )}
    </li>
  );
}
