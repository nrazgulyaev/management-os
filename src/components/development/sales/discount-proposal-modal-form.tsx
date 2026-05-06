"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { proposeDiscount } from "@/lib/development/server/discount-actions";

/**
 * Stage 6.P0.5 — Propose Discount modal.
 * Workflow verb: "Propose discount" (per P0.2 — discounts go through approval).
 *
 * Triggered from a villa or contact context (caller passes the IDs).
 */

const REASONS = [
  { value: "early_bird", label: "Early bird" },
  { value: "family_friend", label: "Family / friend" },
  { value: "cash_payment", label: "Cash payment" },
  { value: "bulk", label: "Bulk purchase" },
  { value: "agent_negotiation", label: "Agent negotiation" },
  { value: "returning_buyer", label: "Returning buyer" },
  { value: "investor_relationship", label: "Investor relationship" },
  { value: "other", label: "Other" },
] as const;

export function DiscountProposalModalForm({
  villaId,
  contactId,
  proposedByUserId,
  originalPriceUsdMinor,
  triggerLabel = "Propose discount",
}: {
  villaId: string;
  contactId: string;
  proposedByUserId: string;
  /** Original list price in USD minor — required by the action's denominator */
  originalPriceUsdMinor: bigint;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [discountType, setDiscountType] = useState<"percent" | "fixed_amount">(
    "percent",
  );
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    // proposeDiscount takes a FormData. We inject the
    // caller-provided context fields (villa/contact/user/original price)
    // and forward everything else from the user's form input.
    const fd = new FormData();
    fd.set("villaId", villaId);
    fd.set("contactId", contactId);
    fd.set("proposedByUserId", proposedByUserId);
    fd.set("appliedToOriginalPriceUsdMinor", String(originalPriceUsdMinor));
    fd.set("discountType", discountType);
    if (discountType === "percent") {
      const v = String(formData.get("discountPercent") ?? "");
      if (v) fd.set("discountPercent", v);
    } else {
      const major = String(formData.get("discountAmountUsd") ?? "");
      if (major) {
        fd.set(
          "discountAmountUsdMinor",
          String(BigInt(Math.round(Number(major) * 100))),
        );
      }
    }
    fd.set("reason", String(formData.get("reason") ?? ""));
    const reasonNote = String(formData.get("reasonNote") ?? "").trim();
    if (reasonNote) fd.set("reasonNote", reasonNote);

    startTransition(async () => {
      try {
        const result = await proposeDiscount(fd);
        if (!result.ok) {
          setError(result.error ?? "Failed to propose discount");
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to propose discount");
      }
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="secondary"
        data-testid="discount-propose-trigger"
      >
        <Tags className="w-4 h-4" strokeWidth={1.75} />
        {triggerLabel}
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Propose discount"
        description="Discounts go through admin approval. The proposal records the negotiation context and the discount math; approval transitions the contract."
        size="md"
      >
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Discount type" required>
              <select
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as "percent" | "fixed_amount")
                }
                className={selectCls}
              >
                <option value="percent">Percentage</option>
                <option value="fixed_amount">Fixed amount (USD)</option>
              </select>
            </Field>
            {discountType === "percent" ? (
              <Field label="Discount percent" required hint="0–100">
                <input
                  name="discountPercent"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0.5"
                  max="100"
                  required
                  placeholder="5.0"
                  className={inputCls}
                />
              </Field>
            ) : (
              <Field label="Discount amount (USD)" required>
                <input
                  name="discountAmountUsd"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="2500.00"
                  className={inputCls}
                />
              </Field>
            )}
          </div>
          <Field label="Reason" required>
            <select name="reason" required className={selectCls} defaultValue="">
              <option value="" disabled>Select…</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Reason note" hint="Context for the approver">
            <textarea name="reasonNote" rows={3} className={textareaCls} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Proposing…">Propose discount</SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
