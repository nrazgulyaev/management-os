"use client";

/**
 * Bank-account detail controls (client island).
 *
 * Mounts the "Edit account / Record balance" actions over the org-scoped
 * `updateBankAccountThreshold` / `recordBankBalance` server actions via the
 * co-located `"use server"` adapters in `_actions.ts`.
 *
 *   - Edit threshold: set/clear the minimum-balance alert threshold.
 *   - Record balance: snapshot the current balance + FX rate as of a date;
 *     the USD-minor column is recomputed server-side.
 *
 * Amounts are entered in MAJOR units of the account's currency; the adapter
 * converts to minor units before the action runs.
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
  recordBalanceAction,
  updateThresholdAction,
  type BankAccountResult,
} from "./_actions";

export interface AccountControlProps {
  id: string;
  currency: string;
  /** Current minimum-balance threshold in MAJOR units (display only). */
  thresholdMajor: string | null;
  /** Current balance in MAJOR units (prefill for record-balance). */
  balanceMajor: string;
  /** Last FX rate used (prefill). */
  lastFxRate: string | null;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  function run(
    fn: (fd: FormData) => Promise<BankAccountResult>,
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

export function BankAccountControls(props: AccountControlProps) {
  const [thresholdOpen, setThresholdOpen] = React.useState(false);
  const [balanceOpen, setBalanceOpen] = React.useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setThresholdOpen(true)}
      >
        Edit threshold
      </button>
      <button
        type="button"
        className="btn btn-accent btn-sm"
        onClick={() => setBalanceOpen(true)}
      >
        Record balance
      </button>

      <ThresholdModal open={thresholdOpen} onOpenChange={setThresholdOpen} {...props} />
      <BalanceModal open={balanceOpen} onOpenChange={setBalanceOpen} {...props} />
    </div>
  );
}

function ThresholdModal({
  open,
  onOpenChange,
  id,
  currency,
  thresholdMajor,
}: AccountControlProps & {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { pending, error, run } = useRun();
  const [dirty, setDirty] = React.useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", id);
    fd.set("currency", currency);
    run(updateThresholdAction, fd, () => {
      setDirty(false);
      onOpenChange(false);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" dirty={dirty} ariaLabel="Edit minimum-balance threshold">
      <ModalHeader
        glyphTone="accent"
        title="Edit threshold"
        description={`Minimum-balance alert for this account · ${currency}`}
        onClose={() => onOpenChange(false)}
      />
      <form onSubmit={handleSubmit}>
        <ModalBody>
          <div className="field">
            <label className="field-label">Minimum balance ({currency})</label>
            <input
              name="thresholdMajor"
              className="input mono"
              type="number"
              min="0"
              step="any"
              placeholder="Leave blank to clear"
              defaultValue={thresholdMajor ?? ""}
              onChange={() => setDirty(true)}
            />
            <div className="field-help">
              The account flags as &quot;below threshold&quot; when its balance
              drops under this. Clear it to disable the alert.
            </div>
          </div>
          {error && <div className="text-[12px] text-danger mt-1">{error}</div>}
        </ModalBody>
        <ModalFooter>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? "Saving…" : "Save threshold"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function BalanceModal({
  open,
  onOpenChange,
  id,
  currency,
  balanceMajor,
  lastFxRate,
}: AccountControlProps & {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { pending, error, run } = useRun();
  const [dirty, setDirty] = React.useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", id);
    fd.set("currency", currency);
    run(recordBalanceAction, fd, () => {
      setDirty(false);
      onOpenChange(false);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="Record account balance">
      <ModalHeader
        glyphTone="ok"
        title="Record balance"
        description={`Snapshot this account's balance + FX as of a date · ${currency}`}
        onClose={() => onOpenChange(false)}
      />
      <form onSubmit={handleSubmit}>
        <ModalBody>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Balance ({currency})</label>
              <input
                name="balanceMajor"
                className="input mono"
                type="number"
                min="0"
                step="any"
                required
                defaultValue={balanceMajor}
                onChange={() => setDirty(true)}
              />
            </div>
            <div className="field">
              <label className="field-label">As of date</label>
              <input
                name="asOfDate"
                className="input"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                onChange={() => setDirty(true)}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label">FX → USD</label>
            <input
              name="fxRate"
              className="input mono"
              pattern="\d+(\.\d+)?"
              required
              defaultValue={currency === "USD" ? "1" : (lastFxRate ?? "")}
              placeholder="1"
              onChange={() => setDirty(true)}
            />
            <div className="field-help">
              USD-equivalent balance is recomputed from this rate. For USD
              accounts use 1.
            </div>
          </div>
          {error && <div className="text-[12px] text-danger mt-1">{error}</div>}
        </ModalBody>
        <ModalFooter>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? "Recording…" : "Record balance"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
