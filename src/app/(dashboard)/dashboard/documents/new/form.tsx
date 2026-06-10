"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createDocumentAction } from "@/features/documents/actions";
import type { ActionResult } from "@/features/projects/actions";

const DOC_TYPES = [
  "contract",
  "invoice",
  "receipt",
  "photo",
  "statement",
  "kyc",
  "certificate",
  "guide",
  "policy",
  "other",
] as const;

const ENTITY_TYPES = [
  "project",
  "villa",
  "owner",
  "booking",
  "supplier",
  "task",
  "maintenance",
] as const;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-accent" disabled={pending}>
      {pending ? "Saving…" : "Create document"}
    </button>
  );
}

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
    <form action={submitAction} className="flex flex-col gap-5 max-w-[760px]">
      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
          {state.error}
        </div>
      )}

      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h2 className="display text-[20px] font-normal">Document metadata</h2>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-3 ml-auto">
            records metadata only
          </span>
        </div>

        <label className="field">
          <span className="field-label">
            Title <span className="text-terra">*</span>
          </span>
          <input
            name="title"
            required
            className="input"
            placeholder="Eternal Villas — Management agreement"
          />
          {errs.title?.[0] && (
            <span className="field-error">{errs.title[0]}</span>
          )}
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="field">
            <span className="field-label">
              Document type <span className="text-terra">*</span>
            </span>
            <select name="documentType" defaultValue="contract" className="select">
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {errs.documentType?.[0] && (
              <span className="field-error">{errs.documentType[0]}</span>
            )}
          </label>
          <label className="field">
            <span className="field-label">
              Entity type <span className="text-terra">*</span>
            </span>
            <select name="entityType" defaultValue="project" className="select">
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {errs.entityType?.[0] && (
              <span className="field-error">{errs.entityType[0]}</span>
            )}
          </label>
          <label className="field">
            <span className="field-label">
              Entity ID (uuid) <span className="text-terra">*</span>
            </span>
            <input
              name="entityId"
              required
              className="input"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
            {errs.entityId?.[0] && (
              <span className="field-error">{errs.entityId[0]}</span>
            )}
          </label>
        </div>
      </div>

      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h2 className="display text-[20px] font-normal">Storage</h2>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-3 ml-auto">
            optional · file upload lands in v3
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="field">
            <span className="field-label">Storage bucket</span>
            <input name="storageBucket" className="input" placeholder="documents" />
          </label>
          <label className="field">
            <span className="field-label">Storage path</span>
            <input
              name="storagePath"
              className="input"
              placeholder="contracts/eternal-2024.pdf"
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">File name</span>
          <input name="fileName" className="input" />
        </label>
      </div>

      <div className="card p-5 flex flex-col gap-4">
        <h2 className="display text-[20px] font-normal">Access</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="field">
            <span className="field-label">
              Visibility <span className="text-terra">*</span>
            </span>
            <select name="visibility" defaultValue="internal" className="select">
              <option value="internal">Internal</option>
              <option value="owner">Owner</option>
              <option value="guest">Guest</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">
              Status <span className="text-terra">*</span>
            </span>
            <select name="status" defaultValue="active" className="select">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        ) : (
          <Link href="/dashboard/documents" className="btn btn-secondary">
            Cancel
          </Link>
        )}
        <SaveButton />
      </div>
    </form>
  );
}
