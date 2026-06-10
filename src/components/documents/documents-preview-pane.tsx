"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { DocAppRow } from "@/features/documents/app-services";
import {
  markDocumentSignedAction,
  deleteDocumentAppAction,
} from "@/features/documents/app-actions";
import { DocumentAiFeedModal } from "./documents-ai-feed";
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

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}

/** Compact section heading — mono uppercase, matches the mock's .det-col h3. */
function PaneHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h4 className="mono text-[10.5px] font-medium uppercase tracking-wide text-ink-tertiary">
        {children}
      </h4>
      {action}
    </div>
  );
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
  const [aiFeedOpen, setAiFeedOpen] = React.useState(false);
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
  const sigStatus = doc.signatureStatus;
  const statusLabel = isSigned
    ? "signed"
    : sigStatus === "countersigned"
      ? "countersigned"
      : sigStatus && sigStatus !== "declined" && sigStatus !== "cancelled"
        ? "awaiting signature"
        : doc.expired
          ? "expired"
          : "active";

  return (
    <div className="flex flex-col gap-5 overflow-hidden rounded-md border border-line bg-surface">
      {/* Header — crumb, title, meta */}
      <div className="border-b border-line bg-cream-warm px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <p className="mono text-[10px] uppercase tracking-wide text-ink-tertiary">
            documents / {doc.documentType}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 text-ink-tertiary transition-colors hover:text-ink"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <h3 className="mt-1.5 text-display text-[20px] font-normal leading-snug text-ink break-words">
          {doc.title}
          <span className="italic font-normal text-terra"> · {statusLabel}</span>
        </h3>
        <div className="mono mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-tertiary">
          <span>
            {doc.entityType}{" "}
            <span className="text-ink-secondary">{doc.entityId.slice(0, 8)}</span>
          </span>
          <span>
            added <span className="text-ink-secondary">{fmt(doc.createdAt)}</span>
          </span>
          {doc.versionCount > 0 && (
            <span>
              version{" "}
              <span className="text-ink-secondary">{doc.versionCount}</span>
            </span>
          )}
          {doc.expiresAt && (
            <span
              className={cn(
                doc.expired
                  ? "text-danger"
                  : doc.expiringSoon
                    ? "text-warning"
                    : undefined,
              )}
            >
              {doc.expired ? "expired" : "expires"}{" "}
              <span className="text-ink-secondary">{fmt(doc.expiresAt)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 px-5 pb-5">
        {/* Preview surface */}
        <div className="rounded-sm border border-line bg-paper px-6 py-8 text-center shadow-sm">
          {doc.hasFile ? (
            <div className="flex flex-col items-center gap-2">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                className="text-ink-tertiary"
                aria-hidden
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p className="text-display text-[15px] text-ink">
                {doc.fileName ?? "Attached file"}
              </p>
              <p className="mono text-[10px] uppercase tracking-wide text-ink-tertiary">
                {doc.mimeType ?? "file"} · {formatBytes(doc.sizeBytes)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-tertiary">
              No file attached. Metadata-only record — upload lands with storage.
            </p>
          )}
        </div>

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}

        {/* Metadata key/value card */}
        <div className="flex flex-col gap-2">
          <PaneHeading>Metadata</PaneHeading>
          <dl className="rounded-md border border-line bg-cream-warm px-4 py-1">
            <KvRow k="category">{doc.documentType}</KvRow>
            <KvRow k="visibility">
              <Badge tone={doc.visibility === "internal" ? "neutral" : "gold"}>
                {doc.visibility}
              </Badge>
            </KvRow>
            <KvRow k="status" tone={statusLabel === "expired" ? "danger" : undefined}>
              {statusLabel}
            </KvRow>
            <KvRow k="size" mono>
              {formatBytes(doc.sizeBytes)}
            </KvRow>
            <KvRow k="ai knowledge">
              {isFed ? <Badge tone="accent">fed</Badge> : "—"}
            </KvRow>
          </dl>
        </div>

        {/* E-sign flow strip */}
        {(sigStatus || isSigned) && (
          <div className="flex flex-col gap-2">
            <PaneHeading>E-sign flow</PaneHeading>
            <ESignFlow status={isSigned ? "signed" : sigStatus} />
          </div>
        )}

        {/* Primary actions */}
        <div className="flex flex-col gap-2">
          <PaneHeading>Actions</PaneHeading>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              asChild={doc.hasFile}
              disabled={!doc.hasFile}
              title={doc.hasFile ? "Download file" : "No file attached"}
            >
              {doc.hasFile ? (
                <a
                  href={`/api/documents/${doc.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                >
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
                run(() =>
                  markDocumentSignedAction({
                    documentId: doc.id,
                    signed: !isSigned,
                  }),
                )
              }
            >
              {isSigned ? "Mark unsigned" : "Mark signed"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAiFeedOpen(true)}
              title={
                isFed
                  ? "In agent knowledge — feed to another agent or remove"
                  : "Feed this document to an AI agent's knowledge base"
              }
            >
              {isFed ? "Manage AI knowledge" : "Feed to AI agent"}
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
        </div>

        {/* Signature requests */}
        <div className="flex flex-col gap-2">
          <PaneHeading action={<SignatureRequestButton documentId={doc.id} />}>
            E-signature
          </PaneHeading>
          {loadingDetail ? (
            <p className="text-xs text-ink-tertiary">Loading…</p>
          ) : detail && detail.signatures.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {detail.signatures.map((s) => (
                <SignatureRequestItem key={s.id} sig={s} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-tertiary">No signature requested yet.</p>
          )}
        </div>

        {/* Versions */}
        <div className="flex flex-col gap-2">
          <PaneHeading
            action={
              <VersionCompareButton
                documentId={doc.id}
                versions={detail?.versions ?? []}
              />
            }
          >
            Versions
          </PaneHeading>
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
                    <Badge tone={v.isCurrent ? "success" : "outline"}>
                      v{v.versionNo}
                    </Badge>
                    <span className="truncate text-ink-secondary">
                      {v.changeNote ?? v.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-ink-tertiary">
                    {fmt(v.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-tertiary">
              Single version. Add a revision to enable compare.
            </p>
          )}
        </div>
      </div>

      <DocumentAiFeedModal
        doc={{
          id: doc.id,
          title: doc.title,
          mimeType: doc.mimeType,
          hasFile: doc.hasFile,
        }}
        open={aiFeedOpen}
        onOpenChange={setAiFeedOpen}
      />

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
    </div>
  );
}

function KvRow({
  k,
  children,
  mono,
  tone,
}: {
  k: string;
  children: React.ReactNode;
  mono?: boolean;
  tone?: "danger";
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 border-b border-line-soft py-2 text-[12.5px] last:border-0">
      <dt className="mono text-[10.5px] uppercase tracking-wide text-ink-tertiary">
        {k}
      </dt>
      <dd
        className={cn(
          "m-0 capitalize text-ink",
          mono && "mono text-xs",
          tone === "danger" && "text-danger",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** Four-step e-sign progress strip — sent → reviewing → signs → countersign. */
function ESignFlow({ status }: { status: string | null }) {
  const order = ["sent", "viewed", "signed", "countersigned"];
  const idx = status ? order.indexOf(status === "pending" ? "sent" : status) : -1;
  const steps = [
    { label: "sent", done: idx >= 0 },
    { label: "reviewing", done: idx >= 1, active: idx === 1 || idx === 0 },
    { label: "owner signs", done: idx >= 2 },
    { label: "countersign", done: idx >= 3 },
  ];
  return (
    <div className="mono flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3.5 py-3 text-[10.5px] uppercase tracking-wide text-ink-tertiary">
      {steps.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <span className="text-ink-tertiary/60">→</span>}
          <span
            className={cn(
              s.done
                ? "text-success"
                : s.active
                  ? "font-medium text-terra"
                  : "text-ink-tertiary",
            )}
          >
            {s.done ? "✓" : s.active ? "●" : "○"} {s.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function SignatureRequestItem({ sig }: { sig: SignatureRow }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const settled = sig.status === "signed" || sig.status === "countersigned";

  return (
    <li className="flex flex-col gap-2 rounded-sm border border-line-soft px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink">
          {sig.signerName}
        </span>
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
