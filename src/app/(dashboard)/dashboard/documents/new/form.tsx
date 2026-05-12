"use client";

import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createDocumentAction } from "@/features/documents/actions";
import type { ActionResult } from "@/features/projects/actions";

export function DocumentForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
} = {}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    createDocumentAction,
    { onSuccess },
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={submitAction}>
      <FormShell
        title="Document metadata"
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href="/dashboard/documents">Cancel</Link>
              </Button>
            )}
            <SubmitButton>Create document</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <Field label="Title" required error={errs.title?.[0]}>
          <input name="title" required className={inputCls} placeholder="Eternal Villas — Management agreement" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Document type" required error={errs.documentType?.[0]}>
            <select name="documentType" defaultValue="contract" className={selectCls}>
              {["contract", "invoice", "receipt", "photo", "statement", "kyc", "certificate", "guide", "policy", "other"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entity type" required error={errs.entityType?.[0]}>
            <select name="entityType" defaultValue="project" className={selectCls}>
              {["project", "villa", "owner", "booking", "supplier", "task", "maintenance"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entity ID (uuid)" required error={errs.entityId?.[0]}>
            <input
              name="entityId"
              required
              className={inputCls}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Storage bucket (optional)">
            <input name="storageBucket" className={inputCls} placeholder="documents" />
          </Field>
          <Field label="Storage path (optional)">
            <input name="storagePath" className={inputCls} placeholder="contracts/eternal-2024.pdf" />
          </Field>
        </div>
        <Field label="File name (optional)">
          <input name="fileName" className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Visibility" required>
            <select name="visibility" defaultValue="internal" className={selectCls}>
              <option value="internal">Internal</option>
              <option value="owner">Owner</option>
              <option value="guest">Guest</option>
              <option value="public">Public</option>
            </select>
          </Field>
          <Field label="Status" required>
            <select name="status" defaultValue="active" className={selectCls}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
