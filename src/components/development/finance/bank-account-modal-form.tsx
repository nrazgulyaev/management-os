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
import { createBankAccount } from "@/lib/development/server/bank-account-actions";

/**
 * Stage 6.P0.4 — modal-driven CRUD for bank accounts.
 *
 * Workflow-verb label per Q2/audit: "Add bank account".
 *
 * Account-type-specific fields (bank vs crypto wallet vs cash) are all
 * present as optional inputs; the bookkeeper fills only the relevant
 * ones. Server-side `createBankAccount` validates the combination.
 */

const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank account" },
  { value: "crypto_exchange", label: "Crypto exchange" },
  { value: "crypto_wallet", label: "Crypto wallet" },
  { value: "cash", label: "Cash" },
] as const;

const CURRENCIES = ["USD", "IDR", "RUB", "EUR", "USDT", "CNY"] as const;

export interface ProjectOption {
  id: string;
  name: string;
}

export function BankAccountModalForm({
  projects,
}: {
  projects: ProjectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const accountCode = String(formData.get("accountCode") ?? "").trim();
    const accountName = String(formData.get("accountName") ?? "").trim();
    const accountType = String(formData.get("accountType") ?? "");
    const currency = String(formData.get("currency") ?? "");
    const bankName = String(formData.get("bankName") ?? "").trim();
    const accountNumber = String(formData.get("accountNumber") ?? "").trim();
    const swiftCode = String(formData.get("swiftCode") ?? "").trim();
    const iban = String(formData.get("iban") ?? "").trim();
    const walletAddress = String(formData.get("walletAddress") ?? "").trim();
    const minMajor = String(formData.get("minimumBalanceMajor") ?? "").trim();
    const primaryProjectId = String(formData.get("primaryProjectId") ?? "");
    const isCompanyAccount = formData.get("isCompanyAccount") === "on";
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      try {
        await createBankAccount({
          accountCode,
          accountName,
          accountType: accountType as never,
          currency: currency as never,
          bankName: bankName || null,
          accountNumber: accountNumber || null,
          swiftCode: swiftCode || null,
          iban: iban || null,
          walletAddress: walletAddress || null,
          minimumBalanceThresholdMinor: minMajor
            ? BigInt(Math.round(Number(minMajor) * 100))
            : null,
          primaryProjectId: primaryProjectId || null,
          isCompanyAccount,
          notes: notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add bank account");
      }
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        data-testid="bank-account-add-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Add bank account
      </Button>

      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Add bank account"
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
            <Field label="Account code" required hint="Unique short identifier">
              <input
                name="accountCode"
                required
                placeholder="MANDIRI_USD_OPS"
                className={inputCls}
              />
            </Field>
            <Field label="Account name" required>
              <input
                name="accountName"
                required
                placeholder="Mandiri USD Operating"
                className={inputCls}
              />
            </Field>
            <Field label="Account type" required>
              <select name="accountType" required className={selectCls} defaultValue="">
                <option value="" disabled>
                  Select type…
                </option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency" required>
              <select name="currency" required className={selectCls} defaultValue="">
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
          </div>

          <details className="rounded-sm border border-line-soft p-3">
            <summary className="text-sm text-ink-secondary cursor-pointer select-none">
              Bank details (for bank accounts)
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
              <Field label="Bank name">
                <input
                  name="bankName"
                  placeholder="Bank Mandiri"
                  className={inputCls}
                />
              </Field>
              <Field label="Account number">
                <input name="accountNumber" className={inputCls} />
              </Field>
              <Field label="SWIFT / BIC">
                <input name="swiftCode" className={inputCls} />
              </Field>
              <Field label="IBAN">
                <input name="iban" className={inputCls} />
              </Field>
            </div>
          </details>

          <details className="rounded-sm border border-line-soft p-3">
            <summary className="text-sm text-ink-secondary cursor-pointer select-none">
              Crypto wallet details
            </summary>
            <div className="mt-4">
              <Field label="Wallet address">
                <input
                  name="walletAddress"
                  placeholder="0x… / TR… / etc."
                  className={inputCls}
                />
              </Field>
            </div>
          </details>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field
              label="Minimum balance threshold"
              hint="Major units in the account currency. Leave blank for no alert."
            >
              <input
                name="minimumBalanceMajor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="5000.00"
                className={inputCls}
              />
            </Field>
            <Field label="Primary project" hint="Optional — links balance to a project">
              <select name="primaryProjectId" className={selectCls} defaultValue="">
                <option value="">— none —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Company account?" hint="Held by Arconique (not a project SPV)">
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                name="isCompanyAccount"
                type="checkbox"
                className="w-4 h-4"
              />
              <span>This is a company-level account</span>
            </label>
          </Field>

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
            <SubmitButton disabled={pending} pendingLabel="Adding…">
              Add bank account
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
