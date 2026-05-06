"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { convertReservationToContract } from "@/lib/development/server/contract-actions";

/**
 * Stage 6.P0.5 — Convert Reservation to Contract modal.
 *
 * Workflow verb: "Convert reservation to contract" (per P0.2 — contracts
 * are not directly created; they emerge from a reservation).
 *
 * Triggered from a reservation's detail page or list-row action. Caller
 * passes the reservation ID + the available contract templates + sales
 * schemes.
 */

export interface ContractTemplateOption {
  id: string;
  name: string;
}

export interface SalesSchemeOption {
  id: string;
  name: string;
}

export function ContractModalForm({
  reservationId,
  reservationLabel,
  contractTemplates,
  salesSchemes,
  /** Suggested default — usually the locked reservation price */
  suggestedTotalUsd,
  /** Suggested FX rate from the reservation */
  suggestedFxRate,
}: {
  reservationId: string;
  reservationLabel: string;
  contractTemplates: ContractTemplateOption[];
  salesSchemes: SalesSchemeOption[];
  suggestedTotalUsd?: number;
  suggestedFxRate?: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    // Inject the reservationId (caller's context).
    formData.set("reservationId", reservationId);
    // Convert total USD major → minor before submit
    const totalMajor = Number(formData.get("totalContractValueUsdMinor") ?? "");
    if (isFinite(totalMajor) && totalMajor > 0) {
      formData.set(
        "totalContractValueUsdMinor",
        String(Math.round(totalMajor * 100)),
      );
    }

    startTransition(async () => {
      try {
        const result = await convertReservationToContract(formData);
        if (!result.ok) {
          setError(result.error ?? "Failed to convert reservation");
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to convert reservation",
        );
      }
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        data-testid="contract-convert-trigger"
      >
        <FileSignature className="w-4 h-4" strokeWidth={1.75} />
        Convert reservation to contract
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Convert reservation to contract"
        description={`Reservation: ${reservationLabel}. Splits the total across the template's component contracts and creates milestones from the chosen sales scheme.`}
        size="md"
      >
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Contract template" required>
              <select name="templateId" required className={selectCls} defaultValue="">
                <option value="" disabled>Select template…</option>
                {contractTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Sales scheme (milestone schedule)" required>
              <select name="salesSchemeId" required className={selectCls} defaultValue="">
                <option value="" disabled>Select scheme…</option>
                {salesSchemes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Total contract value"
              required
              hint="USD major units"
            >
              <input
                name="totalContractValueUsdMinor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                defaultValue={suggestedTotalUsd ?? ""}
                placeholder="250000.00"
                className={inputCls}
              />
            </Field>
            <Field label="FX rate USD→IDR" required>
              <input
                name="fxRateUsdToIdr"
                type="number"
                inputMode="decimal"
                step="1"
                required
                defaultValue={suggestedFxRate ?? 16000}
                className={inputCls}
              />
            </Field>
            <Field label="Contract date" hint="Defaults to today">
              <input
                name="contractDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={2} maxLength={2000} className={textareaCls} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Converting…">
              Convert to contract
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
