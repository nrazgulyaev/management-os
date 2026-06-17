"use client";

/**
 * QC-status control for the material delivery detail page.
 *
 * Lets a receiver set the delivery's quality-check status (pending /
 * accepted / partial acceptance / rejected) plus optional notes, routing
 * through the org-scoped, audited `markDeliveryQualityChecked` action.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, selectCls, textareaCls } from "@/components/admin/form-shell";
import { markDeliveryQualityChecked } from "@/lib/development/server/material-actions";
import {
  MATERIAL_QUALITY_STATUSES,
  MATERIAL_QUALITY_LABEL,
  type MaterialQualityStatus,
} from "@/lib/development/constants/material-constants";

export function DeliveryQcControl({
  deliveryId,
  currentStatus,
  currentNotes,
}: {
  deliveryId: string;
  currentStatus: MaterialQualityStatus;
  currentNotes: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    const status = String(
      formData.get("status") ?? "",
    ) as MaterialQualityStatus;
    const notes = String(formData.get("qualityNotes") ?? "").trim();

    startTransition(async () => {
      try {
        await markDeliveryQualityChecked({
          deliveryId,
          status,
          notes: notes || null,
        });
        setSuccess("Quality check saved.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save quality check");
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ink">
          {success}
        </div>
      )}
      <Field label="Quality check status" required>
        <select
          name="status"
          required
          defaultValue={currentStatus}
          className={selectCls}
        >
          {MATERIAL_QUALITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MATERIAL_QUALITY_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="QC notes">
        <textarea
          name="qualityNotes"
          rows={3}
          defaultValue={currentNotes ?? ""}
          placeholder="Inspection findings, rejected line notes, etc."
          className={textareaCls}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
          {pending ? "Saving…" : "Save quality check"}
        </Button>
      </div>
    </form>
  );
}
