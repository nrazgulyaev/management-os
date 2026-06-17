"use client";

/**
 * MISSING_CRUD closure — WhatsApp phone-number register/edit modal.
 *
 * Mirrors the LeadSourceModalForm pattern (EntityModal + Field +
 * SubmitButton + useTransition + router.refresh). Drives the existing
 * `createWhatsappPhoneNumber` / `updateWhatsappPhoneNumber` actions
 * (both already guard requireInternalUser + admin role and revalidate
 * this page).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  createWhatsappPhoneNumber,
  updateWhatsappPhoneNumber,
} from "@/lib/development/server/whatsapp-credentials-actions";

const NUMBER_TYPES = [
  { value: "arconique_outbound", label: "Arconique outbound" },
  { value: "arconique_inbound", label: "Arconique inbound" },
  { value: "recipient", label: "Recipient" },
  { value: "unknown", label: "Unknown" },
] as const;

type NumberType = (typeof NUMBER_TYPES)[number]["value"];

export interface PhoneInitial {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  numberType: string;
  provider: string;
  twilioPhoneSid: string | null;
  notes: string | null;
}

export function PhoneModalForm({
  mode = "create",
  initial,
}: {
  mode?: "create" | "edit";
  initial?: PhoneInitial;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = mode === "edit" && initial != null;

  function handleSubmit(formData: FormData) {
    setError(null);
    const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const numberType = String(formData.get("numberType") ?? "") as NumberType;
    const provider = String(formData.get("provider") ?? "").trim() || "twilio";
    const twilioPhoneSid = String(formData.get("twilioPhoneSid") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateWhatsappPhoneNumber(initial.id, {
            phoneNumber,
            displayName: displayName || null,
            numberType,
            provider,
            twilioPhoneSid: twilioPhoneSid || null,
            notes: notes || null,
          });
        } else {
          await createWhatsappPhoneNumber({
            phoneNumber,
            displayName: displayName || null,
            numberType,
            provider,
            twilioPhoneSid: twilioPhoneSid || null,
            notes: notes || null,
          });
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to save phone number",
        );
      }
    });
  }

  return (
    <>
      {isEdit ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-secondary btn-xs inline-flex items-center gap-1"
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
          Edit
        </button>
      ) : (
        <Button onClick={() => setOpen(true)} data-testid="phone-add-trigger">
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          Register number
        </Button>
      )}
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? "Edit phone number" : "Register phone number"}
        size="md"
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Phone number" required hint="E.164, e.g. +6281234567890">
              <input
                name="phoneNumber"
                required
                defaultValue={initial?.phoneNumber ?? ""}
                placeholder="+6281234567890"
                className={inputCls}
              />
            </Field>
            <Field label="Display name">
              <input
                name="displayName"
                defaultValue={initial?.displayName ?? ""}
                placeholder="Bali site office"
                className={inputCls}
              />
            </Field>
            <Field label="Number type" required>
              <select
                name="numberType"
                required
                defaultValue={initial?.numberType ?? ""}
                className={selectCls}
              >
                <option value="" disabled>
                  Select…
                </option>
                {NUMBER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Provider">
              <input
                name="provider"
                defaultValue={initial?.provider ?? "twilio"}
                placeholder="twilio"
                className={inputCls}
              />
            </Field>
            <Field label="Twilio phone SID">
              <input
                name="twilioPhoneSid"
                defaultValue={initial?.twilioPhoneSid ?? ""}
                placeholder="PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className={inputCls}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Notes">
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={initial?.notes ?? ""}
                  className={textareaCls}
                />
              </Field>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton
              disabled={pending}
              pendingLabel={isEdit ? "Saving…" : "Registering…"}
            >
              {isEdit ? "Save changes" : "Register number"}
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
