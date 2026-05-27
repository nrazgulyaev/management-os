"use client";

/**
 * Phase 2.1 PR 3 — Modal primitive (template 06).
 *
 * Centered overlay built on Radix Dialog. Three sizes (sm 400 / md
 * 560 / lg 760) and three composition slots (header, body, footer).
 * Multi-step indicator (`<ModalSteps>`) is opt-in for lg flows.
 *
 * Two convenience exports cover the common confirmation cases:
 * `<ConfirmModal>` (default-focus on confirm button) and
 * `<DestructiveConfirmModal>` (default-focus on Cancel; primary
 * styled as `.btn-danger`).
 *
 * Dirty guard — when `dirty` is true, Esc + outside-click are
 * intercepted and a sub-confirm asks before discarding. Implemented
 * via Radix's `onPointerDownOutside` / `onEscapeKeyDown`
 * preventDefault.
 *
 * Distinct from `src/components/ui/primitives/confirm-dialog.tsx`
 * (Stage 10.D.1) which is keyed to the existing 40+ CRUD callsites
 * and uses a Tailwind-class look. This template-06 modal lives
 * alongside it; consumers pick the API that matches their need.
 */

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";

// ---------- Modal ----------

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: ModalSize;
  /** Block close on Esc / outside-click when there are unsaved edits. */
  dirty?: boolean;
  /** Optional callback when the user confirms the discard-guard.
   *  Default behavior — fire onOpenChange(false). */
  onDiscard?: () => void;
  /** Override discard-guard copy. */
  discardTitle?: string;
  discardBody?: React.ReactNode;
  /** ARIA label. Required when ModalHeader is omitted (e.g.
   *  composing inside a parent that handles its own header). */
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}

export function Modal({
  open,
  onOpenChange,
  size = "md",
  dirty,
  onDiscard,
  discardTitle = "Discard unsaved changes?",
  discardBody = "Your edits will be lost.",
  ariaLabel,
  className,
  children,
}: ModalProps) {
  const [askDiscard, setAskDiscard] = React.useState(false);

  function attemptClose() {
    if (dirty) {
      setAskDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  function confirmDiscard() {
    setAskDiscard(false);
    onDiscard?.();
    onOpenChange(false);
  }

  // Modal stays mounted (open=true) while the sub-confirm is open;
  // the sub-confirm renders on top of it.
  return (
    <>
      <Dialog.Root open={open} onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else attemptClose();
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content
            className={`modal ${size}${className ? ` ${className}` : ""}`}
            aria-label={ariaLabel}
            onEscapeKeyDown={(e) => {
              if (dirty) {
                e.preventDefault();
                setAskDiscard(true);
              }
            }}
            onPointerDownOutside={(e) => {
              if (dirty) {
                e.preventDefault();
                setAskDiscard(true);
              }
            }}
          >
            {children}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmModal
        open={askDiscard}
        onOpenChange={setAskDiscard}
        title={discardTitle}
        body={discardBody}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        intent="destructive"
        onConfirm={confirmDiscard}
      />
    </>
  );
}

// ---------- Header / Body / Footer / Steps ----------

export type ModalGlyphTone = "accent" | "ok" | "warn" | "danger";

export interface ModalHeaderProps {
  /** Tinted glyph block (32×32). Pass any ReactNode; tone class
   *  drives the background color-mix. */
  glyph?: React.ReactNode;
  glyphTone?: ModalGlyphTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose?: () => void;
}

export function ModalHeader({
  glyph,
  glyphTone = "accent",
  title,
  description,
  onClose,
}: ModalHeaderProps) {
  return (
    <div className="modal-head">
      {glyph && (
        <div className={`glyph ${glyphTone}`} aria-hidden>
          {glyph}
        </div>
      )}
      <div className="body">
        <Dialog.Title asChild>
          <h3>{title}</h3>
        </Dialog.Title>
        {description && (
          <Dialog.Description asChild>
            <p className="sub">{description}</p>
          </Dialog.Description>
        )}
      </div>
      {onClose && (
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function ModalBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`modal-body${className ? ` ${className}` : ""}`}>{children}</div>;
}

export function ModalFooter({
  help,
  children,
}: {
  /** Mono left-aligned helper text (e.g. "⌘ + Enter to save"). */
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-foot">
      {help && <div className="help">{help}</div>}
      <div className="spacer" />
      {children}
    </div>
  );
}

export interface ModalStep {
  id: string;
  label: string;
  state: "done" | "on" | "todo";
}

export function ModalSteps({ steps }: { steps: ModalStep[] }) {
  return (
    <div className="modal-steps" role="list">
      {steps.map((s, i) => (
        <React.Fragment key={s.id}>
          <div className={`step ${s.state}`} role="listitem">
            <span className="n">{s.state === "done" ? "✓" : i + 1}</span>
            <span>{s.label}</span>
          </div>
          {i < steps.length - 1 && <span className="sep" aria-hidden>—</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------- ConfirmModal / DestructiveConfirmModal ----------

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  intent?: "confirm" | "destructive";
  onConfirm: () => void | Promise<void>;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  intent = "confirm",
  onConfirm,
}: ConfirmModalProps) {
  const [busy, setBusy] = React.useState(false);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const glyph =
    intent === "destructive" ? (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ) : (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal sm confirm"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (intent === "destructive") cancelRef.current?.focus();
            else confirmRef.current?.focus();
          }}
        >
          <ModalHeader
            glyph={glyph}
            glyphTone={intent === "destructive" ? "danger" : "ok"}
            title={title}
            description={body}
          />
          <ModalFooter>
            <button
              ref={cancelRef}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={`btn btn-sm ${intent === "destructive" ? "btn-danger" : "btn-primary"}`}
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </ModalFooter>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DestructiveConfirmModal(props: Omit<ConfirmModalProps, "intent">) {
  return <ConfirmModal {...props} intent="destructive" />;
}
