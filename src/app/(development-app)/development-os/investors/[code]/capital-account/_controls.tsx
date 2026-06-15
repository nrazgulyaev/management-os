"use client";

/**
 * Wire-up sweep — capital-account wallet-movement controls.
 *
 * Mounts three already-built (server-only) actions that had no UI caller:
 *   - recordWalletMovement      → "Record adjustment" modal
 *   - recordCrossProjectMovement→ "Move capital" modal
 *   - reverseWalletMovement     → per-row "Reverse" button
 *
 * All three require a human-entered REASON (money + audit trail), so every
 * form makes it a required field. The actions enforce permissions /
 * org-scoping / audit; this island only collects + dispatches.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeftRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  recordAdjustmentAction,
  reverseMovementAction,
  moveCapitalAction,
  type RecordAdjustmentInput,
} from "./_actions";

type RecordAdjustmentArg = RecordAdjustmentInput["movementType"];
type BucketArg = RecordAdjustmentInput["affectsBalance"];

/** A wallet enriched (in the page) with its commitment's project. */
export interface WalletOption {
  walletId: string;
  label: string;
  projectId: string | null;
  projectName: string | null;
}

const MOVEMENT_TYPES = [
  { value: "manual_adjustment", label: "Manual adjustment" },
  { value: "capital_contribution", label: "Capital contribution" },
  { value: "capital_return", label: "Capital return" },
  { value: "profit_distribution", label: "Profit distribution" },
  { value: "reinvestment_out", label: "Reinvestment out" },
  { value: "reinvestment_in", label: "Reinvestment in" },
  { value: "withdrawal_request", label: "Withdrawal request" },
  { value: "withdrawal_executed", label: "Withdrawal executed" },
  { value: "residual_inventory_realloc", label: "Residual inventory realloc" },
] as const;

const BUCKETS = [
  { value: "cash", label: "Cash (available)" },
  { value: "economic", label: "Economic (incl. residual)" },
  { value: "reinvestment", label: "Reinvestment earmark" },
  { value: "committed", label: "Committed (open)" },
  { value: "pending_distribution", label: "Pending distribution" },
  { value: "residual_inventory", label: "Residual inventory value" },
] as const;

const errBox =
  "rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink";

// ---------------------------------------------------------------------------
// Toolbar — both create-form triggers live together in the page header.
// ---------------------------------------------------------------------------

export function CapitalAccountControls({
  code,
  investorId,
  wallets,
}: {
  code: string;
  investorId: string;
  wallets: WalletOption[];
}) {
  return (
    <div className="flex items-center gap-2">
      <MoveCapitalForm code={code} investorId={investorId} wallets={wallets} />
      <RecordAdjustmentForm code={code} investorId={investorId} wallets={wallets} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1) Record adjustment → recordWalletMovement
// ---------------------------------------------------------------------------

function RecordAdjustmentForm({
  code,
  investorId,
  wallets,
}: {
  code: string;
  investorId: string;
  wallets: WalletOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const noWallets = wallets.length === 0;

  function handleSubmit(formData: FormData) {
    setError(null);
    const walletId = String(formData.get("walletId") ?? "");
    const movementType = String(formData.get("movementType") ?? "");
    const affectsBalance = String(formData.get("affectsBalance") ?? "");
    const direction = String(formData.get("direction") ?? "credit");
    const amount = String(formData.get("amount") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    if (!walletId) return setError("Pick a wallet.");
    if (!reason) return setError("A reason is required.");

    start(async () => {
      const r = await recordAdjustmentAction({
        code,
        walletId,
        investorId,
        movementType: movementType as RecordAdjustmentArg,
        affectsBalance: affectsBalance as BucketArg,
        amount,
        direction: direction as "credit" | "debit",
        reason,
      });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={noWallets}
        title={noWallets ? "This investor has no wallets yet." : undefined}
        data-testid="capital-adjustment-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Record adjustment
      </Button>
      <EntityModal open={open} onClose={() => setOpen(false)} title="Record adjustment" size="lg">
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && <div className={errBox}>{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Wallet" required>
              <select name="walletId" required className={selectCls} defaultValue="">
                <option value="" disabled>
                  Select wallet…
                </option>
                {wallets.map((w) => (
                  <option key={w.walletId} value={w.walletId}>
                    {w.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Movement type" required>
              <select name="movementType" required className={selectCls} defaultValue="manual_adjustment">
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Affects bucket" required hint="Which balance bucket this moves.">
              <select name="affectsBalance" required className={selectCls} defaultValue="cash">
                {BUCKETS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Direction" required>
              <select name="direction" required className={selectCls} defaultValue="credit">
                <option value="credit">Credit (+ add to bucket)</option>
                <option value="debit">Debit (− subtract)</option>
              </select>
            </Field>
            <Field label="Amount (USD)" required hint="Positive value; direction sets the sign.">
              <input
                name="amount"
                required
                inputMode="decimal"
                pattern="[0-9,]+(\.[0-9]{1,2})?"
                placeholder="1,000.00"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Reason" required hint="Recorded on the immutable movement log.">
            <textarea name="reason" required rows={2} className={textareaCls} placeholder="Why this adjustment is being recorded" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Recording…">
              Record adjustment
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2) Move capital → recordCrossProjectMovement
// ---------------------------------------------------------------------------

function MoveCapitalForm({
  code,
  investorId,
  wallets,
}: {
  code: string;
  investorId: string;
  wallets: WalletOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // Cross-project moves need each wallet's project — only project-bound
  // wallets are eligible as a source/target.
  const eligible = wallets.filter((w) => w.projectId);
  const enabled = eligible.length >= 2;

  function handleSubmit(formData: FormData) {
    setError(null);
    const sourceWalletId = String(formData.get("sourceWalletId") ?? "");
    const targetWalletId = String(formData.get("targetWalletId") ?? "");
    const amount = String(formData.get("amount") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    if (!sourceWalletId || !targetWalletId) return setError("Pick both wallets.");
    if (sourceWalletId === targetWalletId)
      return setError("Source and target wallets must differ.");
    if (!reason) return setError("A reason is required.");

    const source = eligible.find((w) => w.walletId === sourceWalletId);
    const target = eligible.find((w) => w.walletId === targetWalletId);
    if (!source?.projectId || !target?.projectId)
      return setError("Both wallets must be tied to a project.");

    start(async () => {
      const r = await moveCapitalAction({
        code,
        sourceWalletId,
        targetWalletId,
        investorId,
        sourceProjectId: source.projectId as string,
        targetProjectId: target.projectId as string,
        amount,
        reason,
      });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={!enabled}
        title={
          enabled
            ? undefined
            : "Needs at least two project-bound wallets for this investor."
        }
        data-testid="capital-move-trigger"
      >
        <ArrowLeftRight className="w-4 h-4" strokeWidth={1.75} />
        Move capital
      </Button>
      <EntityModal open={open} onClose={() => setOpen(false)} title="Move capital between wallets" size="lg">
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && <div className={errBox}>{error}</div>}
          <p className="text-[13px] text-ink-tertiary">
            Writes a paired movement: a <code>reinvestment_out</code> (cash debit)
            on the source and a <code>reinvestment_in</code> (committed credit) on
            the target, inside one transaction.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="From wallet" required>
              <select name="sourceWalletId" required className={selectCls} defaultValue="">
                <option value="" disabled>
                  Select source…
                </option>
                {eligible.map((w) => (
                  <option key={w.walletId} value={w.walletId}>
                    {w.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To wallet" required>
              <select name="targetWalletId" required className={selectCls} defaultValue="">
                <option value="" disabled>
                  Select target…
                </option>
                {eligible.map((w) => (
                  <option key={w.walletId} value={w.walletId}>
                    {w.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (USD)" required hint="Positive; debited from source, credited to target.">
              <input
                name="amount"
                required
                inputMode="decimal"
                pattern="[0-9,]+(\.[0-9]{1,2})?"
                placeholder="5,000.00"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Reason" required hint="Recorded on both paired movements.">
            <textarea name="reason" required rows={2} className={textareaCls} placeholder="Why capital is being moved" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Moving…">
              Move capital
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3) Reverse → reverseWalletMovement (per recorded movement row)
// ---------------------------------------------------------------------------

export function ReverseMovementButton({
  code,
  movementId,
}: {
  code: string;
  movementId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return setError("A reason is required.");
    start(async () => {
      const r = await reverseMovementAction({ code, movementId, reason });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="capital-reverse-trigger"
      >
        <Undo2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        Reverse
      </button>
      <EntityModal open={open} onClose={() => setOpen(false)} title="Reverse movement" size="md">
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && <div className={errBox}>{error}</div>}
          <p className="text-[13px] text-ink-tertiary">
            Marks the original movement as <code>reversed</code> and writes a
            compensating entry that rolls back its bucket. This cannot be undone.
          </p>
          <Field label="Reason" required hint="Stored on the compensating entry.">
            <textarea name="reason" required rows={2} className={textareaCls} placeholder="Why this movement is being reversed" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Reversing…">
              Reverse movement
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
