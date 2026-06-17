"use client";

/**
 * "Record performance" modal for the vendor detail page.
 *
 * Captures an on-time delivery rate (%) and a quality rating (0–5)
 * and persists them through the org-scoped `recordVendorPerformance`
 * server action. These two values drive the KPI snapshot at the top
 * of the vendor profile.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { recordVendorPerformance } from "@/lib/development/server/vendor-actions";

export function RecordPerformanceModal({
  vendorId,
  currentOnTimeRate,
  currentQualityRating,
}: {
  vendorId: string;
  currentOnTimeRate: string | null;
  currentQualityRating: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const onTimeRate = Number(formData.get("onTimeRate") ?? "0");
    const qualityRating = Number(formData.get("qualityRating") ?? "0");

    if (!isFinite(onTimeRate) || onTimeRate < 0 || onTimeRate > 100) {
      setError("On-time rate must be between 0 and 100.");
      return;
    }
    if (!isFinite(qualityRating) || qualityRating < 0 || qualityRating > 5) {
      setError("Quality rating must be between 0 and 5.");
      return;
    }

    startTransition(async () => {
      try {
        await recordVendorPerformance({ vendorId, onTimeRate, qualityRating });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record performance");
      }
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="vendor-record-performance-trigger"
      >
        <Gauge className="w-4 h-4" strokeWidth={1.75} />
        Record performance
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Record performance"
        description="Update this vendor's on-time delivery rate and quality rating."
        size="sm"
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
          <Field
            label="On-time delivery rate (%)"
            required
            hint="0–100"
          >
            <input
              name="onTimeRate"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="100"
              required
              defaultValue={
                currentOnTimeRate != null
                  ? Number(currentOnTimeRate).toString()
                  : ""
              }
              className={inputCls}
            />
          </Field>
          <Field label="Quality rating" required hint="0–5">
            <input
              name="qualityRating"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="5"
              required
              defaultValue={
                currentQualityRating != null
                  ? Number(currentQualityRating).toString()
                  : ""
              }
              className={inputCls}
            />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Saving…">
              Save performance
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
