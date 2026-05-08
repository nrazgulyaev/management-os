/**
 * Stage 10.D.1 — ConfirmDialog primitive.
 *
 * The audit found 40+ pages with destructive actions (Delete / Archive
 * / Revoke / Disable) that lacked a confirmation step. This is the
 * shared confirm-on-destructive primitive every consumer should use.
 *
 * Three convenience variants:
 *   - <ConfirmDialog>          — generic
 *   - <DeleteConfirmDialog>    — danger-toned, focuses Cancel by default
 *   - <ArchiveConfirmDialog>   — neutral; archive is recoverable
 *   - <RevokeConfirmDialog>    — destructive (api keys, sessions, invites)
 *
 * Built on Radix Dialog (already a dep). The async `onConfirm` callback
 * supports server-action awaits — the dialog stays mounted with a
 * loading state until the promise resolves; if the action throws, the
 * error is surfaced inline so consumers don't need their own toast.
 *
 * Reference patterns: research-summary.md theme 4 (transition guards).
 * Used by: 10.E CRUD rollout (40+ delete affordances), 10.F modal-add
 * cancellation, settings revoke flows.
 */
"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmTone = "destructive" | "warning" | "neutral";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Async-friendly. When the promise resolves, the dialog auto-closes. */
  onConfirm: () => void | Promise<void>;
  /** Optional helper rendered above the actions (e.g. "this cannot be undone"). */
  warning?: React.ReactNode;
  /** Force the user to type a confirm phrase (e.g. the entity name). */
  typeToConfirm?: string;
  className?: string;
}

const TONE_BUTTON: Record<ConfirmTone, string> = {
  destructive: "bg-danger text-white hover:opacity-90",
  warning: "bg-warning text-white hover:opacity-90",
  neutral: "bg-ink text-ink-inverse hover:bg-ink/90",
};

const TONE_ICON: Record<ConfirmTone, string> = {
  destructive: "text-danger",
  warning: "text-warning",
  neutral: "text-ink-tertiary",
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "neutral",
  onConfirm,
  warning,
  typeToConfirm,
  className,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [typed, setTyped] = React.useState("");
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) {
      setBusy(false);
      setErr(null);
      setTyped("");
    }
  }, [open]);

  const typedOk = !typeToConfirm || typed === typeToConfirm;

  async function handleConfirm() {
    if (busy || !typedOk) return;
    setErr(null);
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-md bg-surface shadow-[var(--shadow-floating)] p-5 flex flex-col gap-4",
            className,
          )}
        >
          <header className="flex items-start gap-3">
            <div
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center bg-muted shrink-0",
                TONE_ICON[tone],
              )}
            >
              <AlertTriangle className="w-4 h-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium text-ink">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm text-ink-secondary mt-1 leading-relaxed">
                  {description}
                </Dialog.Description>
              )}
            </div>
          </header>
          {warning && (
            <div className="text-xs text-warning bg-warning-weak/40 rounded-sm px-3 py-2">
              {warning}
            </div>
          )}
          {typeToConfirm && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink-secondary">
                Type{" "}
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded-sm text-ink">
                  {typeToConfirm}
                </code>{" "}
                to confirm
              </span>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full px-3 py-2 rounded-sm border border-line-soft bg-surface text-ink font-mono text-sm focus:outline-2 focus:outline-accent"
              />
            </label>
          )}
          {err && (
            <div role="alert" className="text-sm text-danger bg-danger-weak/40 rounded-sm px-3 py-2">
              {err}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 mt-1">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="inline-flex items-center px-4 py-2 rounded-sm text-sm font-medium border border-line-soft bg-surface text-ink hover:bg-muted disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || !typedOk}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-medium disabled:opacity-50 disabled:pointer-events-none",
                TONE_BUTTON[tone],
              )}
              data-tone={tone}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Convenience — destructive delete with sensible defaults.
 * Pass `entityName` for a stock confirmation phrase, or override copy.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  entityName,
  title,
  description,
  confirmLabel = "Delete",
  typeToConfirm,
  warning = "This cannot be undone.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  entityName?: string;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  typeToConfirm?: string;
  warning?: React.ReactNode;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      tone="destructive"
      title={title ?? (entityName ? `Delete ${entityName}?` : "Delete this item?")}
      description={
        description ??
        (entityName
          ? `${entityName} will be permanently removed and cannot be recovered.`
          : undefined)
      }
      confirmLabel={confirmLabel}
      typeToConfirm={typeToConfirm}
      warning={warning}
    />
  );
}

/** Archive is reversible — neutral tone, gentler copy. */
export function ArchiveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  entityName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  entityName?: string;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      tone="neutral"
      title={entityName ? `Archive ${entityName}?` : "Archive this item?"}
      description="It will move to the archive and stop appearing in active lists. You can restore it later."
      confirmLabel="Archive"
    />
  );
}

/**
 * Revoke is destructive: API keys, invites, sessions are non-recoverable
 * once revoked. Defaults to a destructive tone + a hard-to-miss warning.
 */
export function RevokeConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  entityName,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  entityName?: string;
  description?: React.ReactNode;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      tone="destructive"
      title={entityName ? `Revoke ${entityName}?` : "Revoke access?"}
      description={
        description ??
        "Once revoked, this credential stops working immediately. Active sessions are signed out."
      }
      confirmLabel="Revoke"
      warning="This cannot be undone. Issue a new credential if access is needed again."
    />
  );
}
