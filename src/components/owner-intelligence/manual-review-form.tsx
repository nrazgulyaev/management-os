"use client";

import Link from "next/link";
import {
  Field,
  FormShell,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createManualGuestReviewAction } from "@/features/owner-intelligence/actions";
import type { ActionResult } from "@/features/projects/actions";

export interface ManualReviewVillaOption {
  id: string;
  label: string;
}

const SOURCES = [
  { value: "manual", label: "Manual entry" },
  { value: "direct", label: "Direct" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking_com", label: "Booking.com" },
  { value: "google", label: "Google" },
  { value: "internal_survey", label: "Internal survey" },
] as const;

const STATUSES = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "hidden", label: "Hidden" },
  { value: "flagged", label: "Flagged" },
] as const;

const SENTIMENTS = [
  { value: "", label: "— Auto / none —" },
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "mixed", label: "Mixed" },
  { value: "negative", label: "Negative" },
] as const;

/**
 * Create a manual guest review. Backed by `createManualGuestReviewAction`
 * (perm `guest_review.write`, org-scoped — the villa is resolved against the
 * caller org before insert). Follows the Modal-First contract
 * (`onSuccess` / `onCancel`).
 */
export function ManualReviewForm({
  villas,
  onSuccess,
  onCancel,
}: {
  villas: ManualReviewVillaOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction } = useModalOrRouteForm<ActionResult>(
    createManualGuestReviewAction,
    { onSuccess },
  );

  return (
    <form action={submitAction}>
      <FormShell
        title="Manual guest review"
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href="/dashboard/owner-intelligence/reviews">Cancel</Link>
              </Button>
            )}
            <SubmitButton>Add review</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Villa" required>
          <select name="villaId" required defaultValue="" className={selectCls}>
            <option value="" disabled>
              Select villa…
            </option>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Source" required>
            <select name="source" defaultValue="manual" className={selectCls}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rating" hint="0–5 (leave blank if unrated).">
            <input
              type="number"
              name="rating"
              min={0}
              max={5}
              step={0.1}
              className={inputCls}
              placeholder="e.g. 4.5"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Reviewer name" hint="Optional display name.">
            <input
              name="reviewerDisplayName"
              maxLength={80}
              className={inputCls}
              placeholder="e.g. Jane D."
            />
          </Field>
          <Field label="Reviewer country" hint="Optional.">
            <input
              name="reviewerCountry"
              maxLength={40}
              className={inputCls}
              placeholder="e.g. Australia"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Review date" hint="When the stay / review occurred.">
            <input type="date" name="reviewDate" className={inputCls} />
          </Field>
          <Field label="Sentiment" hint="Optional — left blank if unknown.">
            <select name="sentiment" defaultValue="" className={selectCls}>
              {SENTIMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Booking ID" hint="Optional — link to a booking (UUID).">
          <input
            name="bookingId"
            className={inputCls}
            placeholder="Optional booking UUID"
          />
        </Field>

        <Field label="Review text" hint="Optional — the guest's words.">
          <textarea
            name="text"
            rows={4}
            maxLength={4000}
            className={textareaCls}
            placeholder="What the guest said…"
          />
        </Field>

        <Field label="Status">
          <select name="status" defaultValue="published" className={selectCls}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-col gap-3">
          {/* Hidden "false" fallbacks precede each checkbox so an unchecked box
              still posts a value. Object.fromEntries keeps the LAST entry, so a
              checked box (value="true") wins; an unchecked box leaves "false". */}
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input type="hidden" name="ownerVisible" value="false" />
            <input
              type="checkbox"
              name="ownerVisible"
              value="true"
              defaultChecked
              className="h-4 w-4 rounded border-line-soft"
            />
            Visible to owners
          </label>
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input type="hidden" name="publicVisible" value="false" />
            <input
              type="checkbox"
              name="publicVisible"
              value="true"
              className="h-4 w-4 rounded border-line-soft"
            />
            Public (show on marketing surfaces)
          </label>
        </div>
      </FormShell>
    </form>
  );
}
