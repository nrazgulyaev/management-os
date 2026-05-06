"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { recordTransaction } from "@/lib/development/server/transaction-actions";

/**
 * Stage 6.P0.4 — modal-driven Record Transaction.
 *
 * Workflow-verb label per Q2/audit: "Record transaction".
 *
 * Scope: covers the bookkeeper's everyday case (single-project,
 * inflow/outflow, with an account/category/project pick). Advanced
 * fields (multi-project allocation ratios, related drawdown/
 * distribution links, receipt document, FX rate override) are
 * collapsed behind a `<details>` so the bookkeeper sees only the
 * essential 6 fields by default.
 *
 * The FX rate field defaults to "1.0" — appropriate for USD-denominated
 * accounts. For non-USD currencies the bookkeeper enters the rate at
 * record time; future iterations can auto-fill from the latest
 * `dev_fx_snapshots` row but P0.4 keeps it explicit.
 */

const CURRENCIES = ["USD", "IDR", "RUB", "EUR", "USDT", "CNY"] as const;
const DIRECTIONS = [
  { value: "inflow", label: "Inflow (money in)" },
  { value: "outflow", label: "Outflow (money out)" },
  { value: "internal_transfer", label: "Internal transfer" },
] as const;
const ALLOCATION_TYPES = [
  { value: "single_project", label: "Single project" },
  { value: "multi_project", label: "Multi-project (split)" },
  { value: "company_overhead", label: "Company overhead" },
] as const;

export interface BankAccountOption {
  id: string;
  accountCode: string;
  accountName: string;
  currency: string;
}

export interface CostCategoryOption {
  id: string;
  categoryCode: string;
  displayName: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export function TransactionModalForm({
  bankAccounts,
  costCategories,
  projects,
}: {
  bankAccounts: BankAccountOption[];
  costCategories: CostCategoryOption[];
  projects: ProjectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);

    const bankAccountId = String(formData.get("bankAccountId") ?? "");
    const direction = String(formData.get("direction") ?? "");
    const amountMajorRaw = String(formData.get("amountMajor") ?? "").trim();
    const currency = String(formData.get("currency") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const transactionDate = String(formData.get("transactionDate") ?? "");
    const categoryId = String(formData.get("categoryId") ?? "");
    const projectId = String(formData.get("projectId") ?? "");
    const fxRate = String(formData.get("fxRateAtTransaction") ?? "1.0").trim();
    const counterpartyName = String(
      formData.get("counterpartyName") ?? "",
    ).trim();
    const externalReference = String(
      formData.get("externalReference") ?? "",
    ).trim();
    const allocationType = String(
      formData.get("allocationType") ?? "single_project",
    );
    const notes = String(formData.get("notes") ?? "").trim();

    const amountMajor = Number(amountMajorRaw);
    if (!isFinite(amountMajor) || amountMajor <= 0) {
      setError("Amount must be a positive number");
      return;
    }
    // Convert major → minor (cents). USDT uses 6 decimals natively but
    // we follow the schema's bigint(minor) convention; the server
    // action converts USD-equivalents from this.
    const amountMinor = BigInt(Math.round(amountMajor * 100));

    startTransition(async () => {
      try {
        await recordTransaction({
          bankAccountId,
          direction: direction as never,
          amountMinor,
          currency: currency as never,
          fxRateAtTransaction: fxRate,
          description,
          transactionDate,
          categoryId: categoryId || null,
          projectId: projectId || null,
          counterpartyName: counterpartyName || null,
          externalReference: externalReference || null,
          allocationType: allocationType as never,
          notes: notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record transaction");
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        data-testid="transaction-record-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Record transaction
      </Button>

      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Record transaction"
        description="A single bank-account event. The system computes USD equivalent + updates the account balance atomically."
        size="lg"
      >
        <form
          action={handleSubmit}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Bank account" required>
              <select
                name="bankAccountId"
                required
                className={selectCls}
                defaultValue=""
              >
                <option value="" disabled>
                  Select…
                </option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountName} · {a.currency} ({a.accountCode})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Direction" required>
              <select
                name="direction"
                required
                className={selectCls}
                defaultValue=""
              >
                <option value="" disabled>
                  Select…
                </option>
                {DIRECTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount" required hint="In account currency, major units">
              <input
                name="amountMajor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                placeholder="1500.00"
                className={inputCls}
              />
            </Field>
            <Field label="Currency" required>
              <select
                name="currency"
                required
                className={selectCls}
                defaultValue=""
              >
                <option value="" disabled>
                  Select…
                </option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date" required>
              <input
                name="transactionDate"
                type="date"
                required
                defaultValue={today}
                className={inputCls}
              />
            </Field>
            <Field label="Category" hint="Cost / income classification">
              <select
                name="categoryId"
                className={selectCls}
                defaultValue=""
              >
                <option value="">— uncategorised —</option>
                {costCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} ({c.categoryCode})
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Description" required>
            <input
              name="description"
              required
              placeholder="What was this transaction for?"
              className={inputCls}
            />
          </Field>

          <details className="rounded-sm border border-line-soft p-3">
            <summary className="text-sm text-ink-secondary cursor-pointer select-none">
              Advanced (project allocation, counterparty, FX, references)
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
              <Field label="Project">
                <select
                  name="projectId"
                  className={selectCls}
                  defaultValue=""
                >
                  <option value="">— company / unallocated —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Allocation type">
                <select
                  name="allocationType"
                  className={selectCls}
                  defaultValue="single_project"
                >
                  {ALLOCATION_TYPES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Counterparty name" hint="Free-text vendor / payer">
                <input
                  name="counterpartyName"
                  placeholder="ACME Construction Ltd."
                  className={inputCls}
                />
              </Field>
              <Field label="External reference" hint="Bank ref, invoice no, etc.">
                <input
                  name="externalReference"
                  placeholder="REF-2026-0042"
                  className={inputCls}
                />
              </Field>
              <Field
                label="FX rate at transaction"
                hint="Source currency → USD. Use 1.0 for USD accounts."
              >
                <input
                  name="fxRateAtTransaction"
                  type="text"
                  pattern="^\d+(\.\d+)?$"
                  defaultValue="1.0"
                  className={inputCls}
                />
              </Field>
            </div>
          </details>

          <Field label="Notes">
            <textarea
              name="notes"
              rows={2}
              className={textareaCls}
              placeholder="Optional"
            />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Recording…">
              Record transaction
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
