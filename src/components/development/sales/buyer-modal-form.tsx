"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createBuyer } from "@/lib/development/server/buyers/buyer-actions";

/**
 * Stage 6.P0.5 — Add Buyer modal.
 * Workflow verb: "Add buyer".
 */

const KYC_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "documents_requested", label: "Documents requested" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
] as const;

const LANGUAGES = ["en", "ru", "id", "zh", "es"] as const;

export function BuyerModalForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const displayName = String(formData.get("displayName") ?? "").trim();
    const primaryEmail = String(formData.get("primaryEmail") ?? "").trim();
    const primaryPhone = String(formData.get("primaryPhone") ?? "").trim();
    const whatsappPhone = String(formData.get("whatsappPhone") ?? "").trim();
    const preferredLanguage = String(formData.get("preferredLanguage") ?? "en");
    const kycStatus = String(formData.get("kycStatus") ?? "not_started");
    const internalNotes = String(formData.get("internalNotes") ?? "").trim();

    startTransition(async () => {
      try {
        await createBuyer({
          displayName,
          primaryEmail: primaryEmail || null,
          primaryPhone: primaryPhone || null,
          whatsappPhone: whatsappPhone || null,
          preferredLanguage,
          kycStatus: kycStatus as never,
          internalNotes: internalNotes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add buyer");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="buyer-add-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Add buyer
      </Button>
      <EntityModal open={open} onClose={() => setOpen(false)} title="Add buyer" size="md">
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <Field label="Display name" required>
            <input name="displayName" required placeholder="John Doe" className={inputCls} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Primary email">
              <input name="primaryEmail" type="email" inputMode="email" className={inputCls} />
            </Field>
            <Field label="Primary phone">
              <input name="primaryPhone" type="tel" inputMode="tel" className={inputCls} />
            </Field>
            <Field label="WhatsApp phone" hint="E.164 format, e.g. +6281234567890">
              <input name="whatsappPhone" type="tel" inputMode="tel" className={inputCls} />
            </Field>
            <Field label="Preferred language">
              <select name="preferredLanguage" defaultValue="en" className={selectCls}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l.toUpperCase()}</option>
                ))}
              </select>
            </Field>
            <Field label="KYC status" required>
              <select name="kycStatus" required defaultValue="not_started" className={selectCls}>
                {KYC_STATUSES.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Internal notes">
            <textarea name="internalNotes" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Adding…">Add buyer</SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
