"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createInvestor } from "@/lib/development/server/investor-actions";

/**
 * Stage 6.P0.6 — Add Investor modal (Tier 4).
 * Workflow verb: "Add investor".
 */

const INVESTOR_TYPES = [
  { value: "gp", label: "GP (general partner)" },
  { value: "lp_private", label: "LP (private)" },
  { value: "lp_institutional", label: "LP (institutional)" },
  { value: "landowner_jv", label: "Landowner JV" },
] as const;

const LEGAL_ENTITY_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "llc", label: "LLC" },
  { value: "pt_pma", label: "PT PMA" },
  { value: "offshore", label: "Offshore" },
  { value: "trust", label: "Trust" },
] as const;

const CURRENCIES = ["USD", "IDR", "RUB", "EUR", "USDT", "CNY"] as const;
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ru", label: "Russian" },
  { value: "id", label: "Indonesian" },
  { value: "zh", label: "Chinese" },
] as const;

export function InvestorModalForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const investorCode = String(formData.get("investorCode") ?? "").trim();
    const investorType = String(formData.get("investorType") ?? "");
    const legalName = String(formData.get("legalName") ?? "").trim();
    const legalEntityType = String(formData.get("legalEntityType") ?? "");
    const taxResidency = String(formData.get("taxResidency") ?? "").trim();
    const primaryCurrency = String(formData.get("primaryCurrency") ?? "USD");
    const reportingLanguage = String(formData.get("reportingLanguage") ?? "en");
    const contactEmail = String(formData.get("contactEmail") ?? "").trim();
    const contactPhone = String(formData.get("contactPhone") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      try {
        await createInvestor({
          investorCode,
          investorType: investorType as never,
          legalName,
          legalEntityType: (legalEntityType || null) as never,
          taxResidency: taxResidency || null,
          primaryCurrency: primaryCurrency as never,
          reportingLanguage: reportingLanguage as never,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
          notes: notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add investor");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="investor-add-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Add investor
      </Button>
      <EntityModal open={open} onClose={() => setOpen(false)} title="Add investor" size="lg">
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Investor code" required hint="Stable short identifier">
              <input
                name="investorCode"
                required
                pattern="[A-Za-z0-9_-]+"
                placeholder="ALICE_LP_2026"
                className={inputCls}
              />
            </Field>
            <Field label="Investor type" required>
              <select name="investorType" required className={selectCls} defaultValue="">
                <option value="" disabled>Select…</option>
                {INVESTOR_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Legal name" required>
              <input name="legalName" required placeholder="Alice Investor Holdings Ltd." className={inputCls} />
            </Field>
            <Field label="Legal entity type">
              <select name="legalEntityType" defaultValue="" className={selectCls}>
                <option value="">— unspecified —</option>
                {LEGAL_ENTITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Tax residency" hint="ISO country code (e.g. SG, US, ID)">
              <input
                name="taxResidency"
                maxLength={8}
                placeholder="SG"
                className={inputCls}
              />
            </Field>
            <Field label="Primary currency">
              <select name="primaryCurrency" defaultValue="USD" className={selectCls}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Reporting language">
              <select name="reportingLanguage" defaultValue="en" className={selectCls}>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Contact email">
              <input name="contactEmail" type="email" inputMode="email" className={inputCls} />
            </Field>
            <Field label="Contact phone">
              <input name="contactPhone" type="tel" inputMode="tel" className={inputCls} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Adding…">Add investor</SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
