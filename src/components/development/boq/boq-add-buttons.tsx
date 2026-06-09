/**
 * Stage 10.F.2 — BOQ modal-Add button.
 *
 * Replaces the audit-flagged `<Link href="/new">` pattern with
 * <EntityFormModal>-driven Add. Re-uses the existing
 * `createBoqDocument` server action (typed-input). The /new
 * page-level route stays alive as a deep-link fallback (the bulk CSV
 * import flow continues to navigate there).
 *
 * Project FK rendered via `<select>` — same trade-off as drawings.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EntityFormModal,
  type EntityFormField,
} from "@/components/ui/primitives";
import { createBoqDocument } from "@/lib/development/server/boq/boq-actions";

const CURRENCY_OPTIONS = [
  { value: "IDR", label: "IDR" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "AUD", label: "AUD" },
  { value: "SGD", label: "SGD" },
];

interface AddBoqButtonProps {
  projects: Array<{ id: string; name: string }>;
  label?: string;
  variant?: "primary" | "secondary" | "accent";
}

export function AddBoqButton({
  projects,
  label,
  variant = "primary",
}: AddBoqButtonProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const projectOptions = React.useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const fields: EntityFormField<Record<string, unknown>>[] = React.useMemo(
    () => [
      {
        name: "boqCode",
        label: "BOQ code",
        required: true,
        placeholder: "BOQ-ETV-2026-001",
      },
      {
        name: "versionLabel",
        label: "Version",
        required: true,
        placeholder: "v1.0",
      },
      { name: "title", label: "Title", required: true, span: 2 },
      {
        name: "projectId",
        label: "Project",
        type: "select",
        required: true,
        options: projectOptions,
        span: 2,
      },
      {
        name: "currency",
        label: "Currency",
        type: "select",
        options: CURRENCY_OPTIONS,
      },
      { name: "qsFirm", label: "QS firm" },
    ],
    [projectOptions],
  );

  const disabled = projects.length === 0;

  async function handleSubmit(values: Record<string, unknown>) {
    await createBoqDocument({
      boqCode: String(values.boqCode ?? "").trim(),
      title: String(values.title ?? "").trim(),
      projectId: String(values.projectId ?? ""),
      versionLabel: String(values.versionLabel ?? "v1.0").trim(),
      currency: String(values.currency ?? "IDR"),
      qsFirm: values.qsFirm ? String(values.qsFirm) : null,
    });
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Create a project before adding a BOQ" : undefined}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        {label ?? "New BOQ"}
      </Button>
      <EntityFormModal
        open={open}
        onOpenChange={setOpen}
        title="Add BOQ document"
        description="Document metadata only. Sections + items are added (or CSV-imported) on the detail page after creation."
        fields={fields}
        initialValues={{
          projectId: projects[0]?.id ?? "",
          versionLabel: "v1.0",
          currency: "IDR",
        }}
        onSubmit={handleSubmit}
        submitLabel="Create"
      />
    </>
  );
}
