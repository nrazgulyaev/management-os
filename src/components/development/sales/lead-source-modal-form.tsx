"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createLeadSource } from "@/lib/development/server/lead-sources/lead-source-actions";

/**
 * Stage 6.P0.5 — Add Lead Source modal.
 * Workflow verb: "Add lead source".
 */

const CHANNEL_TYPES = [
  { value: "organic_search", label: "Organic search" },
  { value: "paid_search", label: "Paid search" },
  { value: "social_organic", label: "Social (organic)" },
  { value: "social_paid", label: "Social (paid)" },
  { value: "referral", label: "Referral" },
  { value: "direct", label: "Direct" },
  { value: "event", label: "Event" },
  { value: "email", label: "Email" },
  { value: "agent", label: "Agent / partner" },
  { value: "other", label: "Other" },
] as const;

const ATTRIBUTION_MODELS = [
  { value: "first_touch", label: "First touch" },
  { value: "last_touch", label: "Last touch" },
  { value: "linear", label: "Linear" },
  { value: "time_decay", label: "Time decay" },
  { value: "position_based", label: "Position-based" },
] as const;

export function LeadSourceModalForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const sourceKey = String(formData.get("sourceKey") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const channelType = String(formData.get("channelType") ?? "");
    const platform = String(formData.get("platform") ?? "").trim();
    const isPaid = formData.get("isPaid") === "on";
    const attribution = String(formData.get("defaultAttributionModel") ?? "");

    startTransition(async () => {
      try {
        await createLeadSource({
          sourceKey,
          displayName,
          channelType,
          platform: platform || undefined,
          isPaid,
          defaultAttributionModel: (attribution || undefined) as never,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add lead source");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="lead-source-add-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Add lead source
      </Button>
      <EntityModal open={open} onClose={() => setOpen(false)} title="Add lead source" size="md">
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Source key" required hint="snake_case identifier">
              <input
                name="sourceKey"
                required
                pattern="[a-z0-9_]+"
                placeholder="instagram_organic"
                className={inputCls}
              />
            </Field>
            <Field label="Display name" required>
              <input name="displayName" required placeholder="Instagram (organic)" className={inputCls} />
            </Field>
            <Field label="Channel type" required>
              <select name="channelType" required className={selectCls} defaultValue="">
                <option value="" disabled>Select…</option>
                {CHANNEL_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Platform" hint="Free text, e.g. Instagram, Google, Facebook">
              <input name="platform" className={inputCls} />
            </Field>
            <Field label="Default attribution model">
              <select name="defaultAttributionModel" className={selectCls} defaultValue="">
                <option value="">— inherit from settings —</option>
                {ATTRIBUTION_MODELS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Paid channel?">
              <label className="inline-flex items-center gap-2 text-sm text-ink mt-2">
                <input name="isPaid" type="checkbox" className="w-4 h-4" />
                <span>Costs money to acquire (track ROI)</span>
              </label>
            </Field>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Adding…">Add lead source</SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
