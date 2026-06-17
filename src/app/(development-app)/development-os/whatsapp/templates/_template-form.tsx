"use client";

/**
 * MISSING_CRUD closure — WhatsApp template register/edit modal.
 *
 * Mirrors the LeadSourceModalForm pattern (EntityModal + Field +
 * SubmitButton + useTransition + router.refresh). Posts the typed
 * object shape that `createWhatsappTemplate` / `updateWhatsappTemplate`
 * expect — language versions are collected per-language and folded into
 * the `languageVersions` jsonb the action stores.
 *
 * A template must be registered (draft) here, then advanced to
 * `approved` (recording its Twilio Content SID) via the row-level
 * TemplateStatusControl before `sendWhatsAppTemplateMessage` will send
 * it.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  createWhatsappTemplate,
  updateWhatsappTemplate,
} from "@/lib/development/server/whatsapp-credentials-actions";

const LANGS = [
  { code: "en", label: "English" },
  { code: "ru", label: "Russian" },
  { code: "id", label: "Indonesian" },
  { code: "zh", label: "Chinese" },
] as const;

type LangVersion = { body: string; header?: string };

export interface TemplateInitial {
  id: string;
  templateKey: string;
  displayName: string;
  description: string | null;
  languageVersions: Record<string, LangVersion>;
  expectedVariables: string[] | null;
  notificationEventType: string | null;
  twilioTemplateSid: string | null;
  metaTemplateId: string | null;
}

function buildLanguageVersions(
  formData: FormData,
): Record<string, LangVersion> {
  const out: Record<string, LangVersion> = {};
  for (const { code } of LANGS) {
    const body = String(formData.get(`body_${code}`) ?? "").trim();
    if (!body) continue;
    const header = String(formData.get(`header_${code}`) ?? "").trim();
    out[code] = header ? { body, header } : { body };
  }
  return out;
}

export function TemplateModalForm({
  mode = "create",
  initial,
}: {
  mode?: "create" | "edit";
  initial?: TemplateInitial;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = mode === "edit" && initial != null;

  function handleSubmit(formData: FormData) {
    setError(null);
    const templateKey = String(formData.get("templateKey") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const notificationEventType = String(
      formData.get("notificationEventType") ?? "",
    ).trim();
    const twilioTemplateSid = String(
      formData.get("twilioTemplateSid") ?? "",
    ).trim();
    const metaTemplateId = String(formData.get("metaTemplateId") ?? "").trim();
    const expectedVariablesRaw = String(
      formData.get("expectedVariables") ?? "",
    ).trim();
    const expectedVariables = expectedVariablesRaw
      ? expectedVariablesRaw
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : null;
    const languageVersions = buildLanguageVersions(formData);

    if (Object.keys(languageVersions).length === 0) {
      setError("Add a message body for at least one language.");
      return;
    }

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateWhatsappTemplate(initial.id, {
            displayName,
            description: description || null,
            languageVersions,
            expectedVariables,
            notificationEventType: notificationEventType || null,
            twilioTemplateSid: twilioTemplateSid || null,
            metaTemplateId: metaTemplateId || null,
          });
        } else {
          await createWhatsappTemplate({
            templateKey,
            displayName,
            description: description || null,
            languageVersions,
            expectedVariables,
            notificationEventType: notificationEventType || null,
            twilioTemplateSid: twilioTemplateSid || null,
            metaTemplateId: metaTemplateId || null,
          });
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to save template",
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
        <Button onClick={() => setOpen(true)} data-testid="template-add-trigger">
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          Register template
        </Button>
      )}
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? "Edit template" : "Register WhatsApp template"}
        size="lg"
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
            <Field
              label="Template key"
              required
              hint="snake_case identifier, immutable once registered"
            >
              <input
                name="templateKey"
                required={!isEdit}
                readOnly={isEdit}
                defaultValue={initial?.templateKey ?? ""}
                pattern="[a-z0-9_]+"
                placeholder="site_report_ready"
                className={inputCls}
              />
            </Field>
            <Field label="Display name" required>
              <input
                name="displayName"
                required
                defaultValue={initial?.displayName ?? ""}
                placeholder="Site report ready"
                className={inputCls}
              />
            </Field>
            <Field label="Trigger event type" hint="Notification event this fires on">
              <input
                name="notificationEventType"
                defaultValue={initial?.notificationEventType ?? ""}
                placeholder="site_report.published"
                className={inputCls}
              />
            </Field>
            <Field
              label="Expected variables"
              hint="Comma-separated, e.g. name, date, amount"
            >
              <input
                name="expectedVariables"
                defaultValue={(initial?.expectedVariables ?? []).join(", ")}
                placeholder="name, date"
                className={inputCls}
              />
            </Field>
            <Field
              label="Twilio Content SID"
              hint="HX… — required before approval"
            >
              <input
                name="twilioTemplateSid"
                defaultValue={initial?.twilioTemplateSid ?? ""}
                placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className={inputCls}
              />
            </Field>
            <Field label="Meta template id" hint="Optional Meta WABA template id">
              <input
                name="metaTemplateId"
                defaultValue={initial?.metaTemplateId ?? ""}
                className={inputCls}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Description">
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={initial?.description ?? ""}
                  className={textareaCls}
                />
              </Field>
            </div>
          </div>

          <div className="border-t border-line-soft pt-4">
            <div className="text-label mb-1">Language versions</div>
            <p className="text-[11px] text-ink-tertiary mb-3">
              Add the message body for each language you support. Use{" "}
              <code className="font-mono">{"{{variable}}"}</code> for
              substitutions. At least one language is required.
            </p>
            <div className="flex flex-col gap-4">
              {LANGS.map(({ code, label }) => {
                const v = initial?.languageVersions?.[code];
                return (
                  <div
                    key={code}
                    className="rounded-md border border-line-soft p-3"
                  >
                    <div className="text-[12px] font-medium text-ink mb-2">
                      {label}{" "}
                      <span className="font-mono text-ink-tertiary">
                        ({code})
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        name={`header_${code}`}
                        defaultValue={v?.header ?? ""}
                        placeholder="Header (optional)"
                        className={inputCls}
                      />
                      <textarea
                        name={`body_${code}`}
                        rows={2}
                        defaultValue={v?.body ?? ""}
                        placeholder="Message body"
                        className={textareaCls}
                      />
                    </div>
                  </div>
                );
              })}
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
              {isEdit ? "Save changes" : "Register template"}
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
