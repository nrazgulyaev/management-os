"use client";

/**
 * Corporate-events controls (client island).
 *
 * Mounts create / edit / delete over the corporate_events backend via the
 * co-located `"use server"` adapters in `_actions.ts`. Director loans,
 * dividends, share transfers — the owner-side flows. Amounts are entered
 * in MAJOR units of the chosen currency; the adapter converts to minor.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  createCorporateEventAction,
  updateCorporateEventAction,
  deleteCorporateEventAction,
  type CorporateEventResult,
} from "./_actions";

const EVENT_TYPE_OPTIONS = [
  { value: "director_loan_in", label: "Director loan in" },
  { value: "director_loan_repayment", label: "Director loan repayment" },
  { value: "shareholder_contribution", label: "Shareholder contribution" },
  { value: "dividend_declared", label: "Dividend declared" },
  { value: "dividend_paid", label: "Dividend paid" },
  { value: "share_transfer", label: "Share transfer" },
  { value: "other", label: "Other" },
] as const;

const CURRENCY_OPTIONS = ["USD", "IDR", "RUB", "EUR", "USDT", "CNY"] as const;

export interface ContactOption {
  id: string;
  fullName: string;
}

export interface CorporateEventFormValues {
  id?: string;
  eventCode?: string;
  eventType: string;
  relatedContactId: string | null;
  amountCurrency: string;
  amountMajor: string;
  fxRate: string;
  eventDate: string;
  description: string;
  notes: string;
}

function minorToMajor(minor: string, currency: string): string {
  const divisor = currency === "USDT" ? 1_000_000 : 100;
  const fraction = currency === "USDT" || currency === "USD" || currency === "EUR" ? 2 : 0;
  return (Number(minor) / divisor).toFixed(fraction);
}

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  function run(
    fn: (fd: FormData) => Promise<CorporateEventResult>,
    fd: FormData,
    onOk?: () => void,
  ) {
    setError(null);
    start(async () => {
      const res = await fn(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }
  return { pending, error, setError, run };
}

function EventModal({
  open,
  onOpenChange,
  contacts,
  initial,
  mode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contacts: ContactOption[];
  initial?: CorporateEventFormValues;
  mode: "create" | "edit";
}) {
  const { pending, error, run } = useRun();
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (open) setDirty(false);
  }, [open]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (mode === "create") {
      run(createCorporateEventAction, fd, () => onOpenChange(false));
    } else {
      if (initial?.id) fd.set("id", initial.id);
      run(updateCorporateEventAction, fd, () => onOpenChange(false));
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      dirty={dirty}
      ariaLabel={mode === "create" ? "New corporate event" : "Edit corporate event"}
    >
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21h18" />
            <path d="M5 21V7l8-4v18" />
            <path d="M19 21V11l-6-4" />
          </svg>
        }
        glyphTone="accent"
        title={mode === "create" ? "New corporate event" : "Edit corporate event"}
        description="Director loans, dividends, share transfers — owner-side flows excluded from the Self-Sustaining cash-flow calc."
        onClose={() => onOpenChange(false)}
      />
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {mode === "create" && (
            <div className="field">
              <label className="field-label">Event code</label>
              <input
                name="eventCode"
                className="input mono"
                required
                pattern="[A-Za-z0-9_-]+"
                placeholder="CE-2026-0007"
                defaultValue={initial?.eventCode ?? ""}
                onChange={() => setDirty(true)}
              />
              <div className="field-help">Unique reference. Letters, digits, dashes, underscores.</div>
            </div>
          )}
          <div className="field-row">
            <div className="field">
              <label className="field-label">Type</label>
              <select
                name="eventType"
                className="select"
                required
                defaultValue={initial?.eventType ?? "director_loan_in"}
                onChange={() => setDirty(true)}
              >
                {EVENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Date</label>
              <input
                name="eventDate"
                className="input"
                type="date"
                required
                defaultValue={initial?.eventDate ?? new Date().toISOString().slice(0, 10)}
                onChange={() => setDirty(true)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Currency</label>
              <select
                name="amountCurrency"
                className="select"
                required
                defaultValue={initial?.amountCurrency ?? "USD"}
                onChange={() => setDirty(true)}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Amount</label>
              <input
                name="amountMajor"
                className="input mono"
                type="number"
                min="0"
                step="any"
                required
                placeholder="50000"
                defaultValue={initial?.amountMajor ?? ""}
                onChange={() => setDirty(true)}
              />
            </div>
            <div className="field">
              <label className="field-label">FX → USD</label>
              <input
                name="fxRate"
                className="input mono"
                pattern="\d+(\.\d+)?"
                required
                placeholder="1"
                defaultValue={initial?.fxRate ?? "1"}
                onChange={() => setDirty(true)}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Related contact (optional)</label>
            <select
              name="relatedContactId"
              className="select"
              defaultValue={initial?.relatedContactId ?? ""}
              onChange={() => setDirty(true)}
            >
              <option value="">— none —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName}</option>
              ))}
            </select>
            <div className="field-help">Required to enforce director-loan repayment limits.</div>
          </div>
          <div className="field">
            <label className="field-label">Description</label>
            <input
              name="description"
              className="input"
              required
              placeholder="Q1 director loan to cover land deposit"
              defaultValue={initial?.description ?? ""}
              onChange={() => setDirty(true)}
            />
          </div>
          <div className="field">
            <label className="field-label">Notes (optional)</label>
            <input
              name="notes"
              className="input"
              defaultValue={initial?.notes ?? ""}
              onChange={() => setDirty(true)}
            />
          </div>
          {error && <div className="text-[12px] text-danger mt-1">{error}</div>}
        </ModalBody>
        <ModalFooter help="USD amount is recomputed from currency × FX rate.">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? "Saving…" : mode === "create" ? "Record event" : "Save changes"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export function NewCorporateEventButton({ contacts }: { contacts: ContactOption[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className="btn btn-accent btn-sm" onClick={() => setOpen(true)}>
        + New corporate event
      </button>
      <EventModal open={open} onOpenChange={setOpen} contacts={contacts} mode="create" />
    </>
  );
}

export interface CorporateEventRowData {
  id: string;
  eventCode: string;
  eventType: string;
  relatedContactId: string | null;
  amountCurrency: string;
  amountOriginalMinor: string;
  fxRate: string;
  eventDate: string;
  description: string;
  notes: string | null;
}

export function CorporateEventRowActions({
  event,
  contacts,
}: {
  event: CorporateEventRowData;
  contacts: ContactOption[];
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { pending, error, run } = useRun();

  const initial: CorporateEventFormValues = {
    id: event.id,
    eventCode: event.eventCode,
    eventType: event.eventType,
    relatedContactId: event.relatedContactId,
    amountCurrency: event.amountCurrency,
    amountMajor: minorToMajor(event.amountOriginalMinor, event.amountCurrency),
    fxRate: String(event.fxRate),
    eventDate: event.eventDate,
    description: event.description,
    notes: event.notes ?? "",
  };

  function confirmDelete() {
    const fd = new FormData();
    fd.set("id", event.id);
    run(deleteCorporateEventAction, fd, () => setConfirmOpen(false));
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="text-xs px-2 py-0.5 rounded border border-line-soft bg-surface hover:bg-muted/50"
        onClick={() => setEditOpen(true)}
      >
        Edit
      </button>
      <button
        type="button"
        className="text-xs px-2 py-0.5 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5"
        onClick={() => setConfirmOpen(true)}
      >
        Delete
      </button>

      <EventModal
        open={editOpen}
        onOpenChange={setEditOpen}
        contacts={contacts}
        initial={initial}
        mode="edit"
      />

      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        size="sm"
        ariaLabel="Delete corporate event"
      >
        <ModalHeader
          glyphTone="danger"
          title="Delete corporate event?"
          description={`${event.eventCode} — ${event.description}`}
          onClose={() => setConfirmOpen(false)}
        />
        <ModalBody>
          <p className="text-[13px] text-ink-3">
            This permanently removes the event from the corporate-events
            ledger. This cannot be undone.
          </p>
          {error && <div className="text-[12px] text-danger mt-2">{error}</div>}
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirmOpen(false)}
          >
            Keep
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={confirmDelete}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete event"}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
