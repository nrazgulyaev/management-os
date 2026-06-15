"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_LABEL,
} from "@/lib/development/constants/investor-constants";
import { createCommitmentAction } from "@/app/(development-app)/development-os/commitments/_actions";

/**
 * Wire-up — Create capital commitment modal (Tier 4).
 * Workflow verb: "New commitment".
 *
 * Posts to createCommitmentAction, the "use server" adapter for the
 * org-scoped createCommitment action (commitment-actions.ts). The action
 * validates that the investor + project belong to the caller's org and
 * opens the commitment AND its empty wallet in one transaction.
 *
 * Investors + projects are sourced from the readers the commitments page
 * already uses, passed in as props.
 */

export interface CommitmentInvestorOption {
  id: string;
  investorCode: string;
  legalName: string;
}

export interface CommitmentProjectOption {
  id: string;
  name: string;
}

export function CommitmentModalForm({
  investors,
  projects,
}: {
  investors: CommitmentInvestorOption[];
  projects: CommitmentProjectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const noInvestors = investors.length === 0;

  function handleSubmit(formData: FormData) {
    setError(null);
    const investorId = String(formData.get("investorId") ?? "");
    const projectIdRaw = String(formData.get("projectId") ?? "");
    const commitmentCode = String(formData.get("commitmentCode") ?? "").trim();
    const committedAmountMajor = String(formData.get("committedAmountMajor") ?? "").trim();
    const committedCurrency = String(formData.get("committedCurrency") ?? "USD");
    const fxRateAtCommitment = String(formData.get("fxRateAtCommitment") ?? "").trim();
    const profitSharePercent = String(formData.get("profitSharePercent") ?? "").trim();
    const capitalReturnPriority = Number(formData.get("capitalReturnPriority") ?? 1);
    const signedAt = String(formData.get("signedAt") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!investorId) {
      setError("Pick an investor.");
      return;
    }

    startTransition(async () => {
      const r = await createCommitmentAction({
        investorId,
        projectId: projectIdRaw || null,
        commitmentCode,
        committedAmountMajor,
        committedCurrency,
        fxRateAtCommitment: fxRateAtCommitment || "1",
        profitSharePercent,
        capitalReturnPriority: Number.isFinite(capitalReturnPriority)
          ? Math.max(1, Math.trunc(capitalReturnPriority))
          : 1,
        signedAt: signedAt || null,
        notes: notes || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
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
        variant="accent"
        size="sm"
        data-testid="commitment-add-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        New commitment
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="New capital commitment"
        size="lg"
      >
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          {noInvestors && (
            <div className="rounded-md border border-line-soft bg-muted/40 px-4 py-2.5 text-sm text-ink-secondary">
              Add an investor first — a commitment must be opened against an
              existing investor in your organization.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Investor" required>
              <select name="investorId" required className={selectCls} defaultValue="">
                <option value="" disabled>
                  Select investor…
                </option>
                {investors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.legalName} ({i.investorCode})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project" hint="Leave blank for a multi-project commitment">
              <select name="projectId" defaultValue="" className={selectCls}>
                <option value="">— Multi-project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Commitment code" required hint="Stable short identifier">
              <input
                name="commitmentCode"
                required
                pattern="[A-Za-z0-9_-]+"
                maxLength={64}
                placeholder="ALICE_VILLA_A_2026"
                className={inputCls}
              />
            </Field>
            <Field label="Capital-return priority" hint="1 = first to be repaid">
              <input
                name="capitalReturnPriority"
                type="number"
                min={1}
                step={1}
                defaultValue={1}
                className={inputCls}
              />
            </Field>
            <Field label="Committed amount" required hint="In the chosen currency">
              <input
                name="committedAmountMajor"
                type="number"
                min="0"
                step="any"
                required
                placeholder="250000"
                className={inputCls}
              />
            </Field>
            <Field label="Currency" required>
              <select name="committedCurrency" defaultValue="USD" className={selectCls}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_LABEL[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="FX rate at commitment"
              required
              hint="1 USD = N currency (use 1 for USD)"
            >
              <input
                name="fxRateAtCommitment"
                required
                pattern="\d+(\.\d+)?"
                placeholder="1"
                defaultValue="1"
                className={inputCls}
              />
            </Field>
            <Field label="Profit share %" required hint="e.g. 12.5">
              <input
                name="profitSharePercent"
                required
                pattern="\d+(\.\d+)?"
                placeholder="12.5"
                className={inputCls}
              />
            </Field>
            <Field label="Signed at" hint="Date the agreement was signed">
              <input name="signedAt" type="date" className={inputCls} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-3 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending || noInvestors} pendingLabel="Creating…">
              Create commitment
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
