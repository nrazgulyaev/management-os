"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createReservation } from "@/lib/development/server/reservation-actions";

/**
 * Stage 6.P0.5 — Create Reservation modal.
 *
 * Workflow verb: "Create reservation".
 *
 * Reservation locks a unit's price at creation time + transitions the
 * lead role to status='reservation'. Concurrency guard is at the SQL
 * level (partial-unique index on villa+active reservation).
 */

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "crypto_usdt", label: "Crypto USDT" },
  { value: "crypto_other", label: "Crypto (other)" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
] as const;

export interface ContactOption {
  id: string;
  fullName: string;
  email: string | null;
}

export interface VillaOption {
  id: string;
  unitCode: string;
  name: string | null;
  projectId: string;
  projectName: string;
}

export function ReservationModalForm({
  contacts,
  villas,
}: {
  contacts: ContactOption[];
  villas: VillaOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedVillaId, setSelectedVillaId] = useState<string>("");
  const router = useRouter();

  // Auto-derive projectId from selected villa.
  const selectedVilla = villas.find((v) => v.id === selectedVillaId);
  const derivedProjectId = selectedVilla?.projectId ?? "";

  function handleSubmit(formData: FormData) {
    setError(null);
    // Inject derived projectId
    formData.set("projectId", derivedProjectId);

    startTransition(async () => {
      try {
        const result = await createReservation(formData);
        if (!result.ok) {
          setError(result.error ?? "Failed to create reservation");
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create reservation");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="reservation-create-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Create reservation
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Create reservation"
        description="Locks the unit's current list price + holds it for the configured period. Lead role transitions to status='reservation'."
        size="lg"
      >
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Contact" required>
              <select name="contactId" required className={selectCls} defaultValue="">
                <option value="" disabled>Select a contact…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}{c.email ? ` (${c.email})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Villa" required>
              <select
                name="villaId"
                required
                className={selectCls}
                value={selectedVillaId}
                onChange={(e) => setSelectedVillaId(e.target.value)}
              >
                <option value="" disabled>Select a villa…</option>
                {villas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.unitCode} · {v.projectName}{v.name ? ` (${v.name})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Reservation fee"
              required
              hint="USD major units (e.g. 5000.00 for $5,000)"
            >
              <input
                name="reservationFeeUsdMinor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                placeholder="5000.00"
                className={inputCls}
                onBlur={(e) => {
                  // Convert major→minor before submit so we keep
                  // the schema's `coerce.bigint().positive()` happy
                  const major = Number(e.currentTarget.value);
                  if (isFinite(major) && major > 0) {
                    e.currentTarget.value = String(
                      Math.round(major * 100),
                    );
                  }
                }}
              />
            </Field>
            <Field label="FX rate USD→IDR" hint="Lock for this reservation">
              <input
                name="fxRateUsdToIdr"
                type="number"
                inputMode="decimal"
                step="1"
                defaultValue="16000"
                className={inputCls}
              />
            </Field>
            <Field label="Payment method" required>
              <select name="paymentMethod" required className={selectCls} defaultValue="">
                <option value="" disabled>Select…</option>
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Payment reference" hint="Bank ref, txn hash, etc.">
              <input name="paymentReference" maxLength={200} className={inputCls} />
            </Field>
            <Field label="Hold expiry (days)" hint="1–90; default 14">
              <input
                name="expiresInDays"
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                defaultValue={14}
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
            <SubmitButton disabled={pending} pendingLabel="Creating…">Create reservation</SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
