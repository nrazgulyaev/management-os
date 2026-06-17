"use client";

/**
 * Budget-line add/edit modal (client island).
 *
 * Mounts a Modal (template-06) over `saveBudgetLineAction`. Pick a project
 * + cost category + budgeted amount (MAJOR USD) + effective-from date, then
 * save. createBudgetLine is supersession-aware — re-saving the same
 * (project, category) pair edits the line by superseding the prior version,
 * so this single form covers both "Add" and "Edit budget line".
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  saveBudgetLineAction,
  type BudgetLineFormResult,
} from "./_budget-actions";

export interface BudgetProjectOption {
  id: string;
  name: string;
}

export interface BudgetCategoryOption {
  id: string;
  code: string;
  displayName: string;
}

export function AddBudgetLineButton({
  projects,
  categories,
  defaultProjectId,
  label = "+ Add / edit budget line",
}: {
  projects: BudgetProjectOption[];
  categories: BudgetCategoryOption[];
  defaultProjectId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  const noCategories = categories.length === 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res: BudgetLineFormResult = await saveBudgetLineAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDirty(false);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-accent btn-sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={projects.length === 0}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        {label}
      </button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        size="md"
        dirty={dirty}
        ariaLabel="Add or edit budget line"
      >
        <ModalHeader
          glyph={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
          glyphTone="accent"
          title="Budget line"
          description="Set a category's budgeted amount. Re-saving the same category edits it (prior version is superseded)."
          onClose={() => setOpen(false)}
        />
        <form onSubmit={handleSubmit}>
          <ModalBody>
            {noCategories ? (
              <p className="text-[13px] text-ink-3">
                No cost categories are configured for your organization yet.
                Add categories first, then return here to budget against them.
              </p>
            ) : (
              <>
                <div className="field">
                  <label className="field-label">Project</label>
                  <select
                    name="projectId"
                    className="select"
                    required
                    defaultValue={defaultProjectId ?? projects[0]?.id ?? ""}
                    onChange={() => setDirty(true)}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Cost category</label>
                  <select
                    name="categoryId"
                    className="select"
                    required
                    defaultValue=""
                    onChange={() => setDirty(true)}
                  >
                    <option value="" disabled>
                      Pick a category
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Budgeted amount (USD)</label>
                    <input
                      name="amountMajor"
                      className="input mono"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="250000"
                      onChange={() => setDirty(true)}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Effective from</label>
                    <input
                      name="effectiveFrom"
                      className="input"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      onChange={() => setDirty(true)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Notes (optional)</label>
                  <input
                    name="notes"
                    className="input"
                    placeholder="Revision reason, scope note…"
                    onChange={() => setDirty(true)}
                  />
                </div>
                {error && (
                  <div className="text-[12px] text-danger mt-1">{error}</div>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter help="Supersession keeps the variance report's version chain intact.">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={pending || noCategories}
            >
              {pending ? "Saving…" : "Save budget line"}
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
