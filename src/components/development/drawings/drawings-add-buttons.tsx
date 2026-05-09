/**
 * Stage 10.F.2 — Drawings modal-Add button.
 *
 * Replaces the audit-flagged `<Link href="/new">` pattern with
 * <EntityFormModal>-driven Add. Re-uses the existing `createDrawing`
 * server action (typed-input). The /new page-level route stays alive
 * as a deep-link fallback.
 *
 * The drawing's project FK is required; consumers must pass the
 * project list as `projects` so the modal can render a `<select>`.
 * Pattern-guide trade-off: a `<select>` is acceptable while the
 * typical workspace has < 50 projects (Arconique today). Switch to
 * the `/new` page if that threshold is exceeded — it's still wired.
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
import { createDrawing } from "@/lib/development/server/drawings/drawing-actions";

const DRAWING_TYPE_OPTIONS = [
  { value: "architectural", label: "Architectural" },
  { value: "structural", label: "Structural" },
  { value: "mep_electrical", label: "MEP — Electrical" },
  { value: "mep_plumbing", label: "MEP — Plumbing" },
  { value: "mep_hvac", label: "MEP — HVAC" },
  { value: "landscape", label: "Landscape" },
  { value: "pool", label: "Pool" },
  { value: "site_plan", label: "Site plan" },
  { value: "detail", label: "Detail" },
  { value: "shop_drawing", label: "Shop drawing" },
  { value: "as_built", label: "As-built" },
  { value: "sketch", label: "Sketch" },
  { value: "other", label: "Other" },
];

const DRAWING_PHASE_OPTIONS = [
  { value: "", label: "—" },
  { value: "concept", label: "Concept" },
  { value: "schematic_design", label: "Schematic design" },
  { value: "design_development", label: "Design development" },
  { value: "permit_set", label: "Permit set" },
  { value: "construction_set", label: "Construction set" },
  { value: "as_built", label: "As-built" },
];

interface AddDrawingButtonProps {
  projects: Array<{ id: string; name: string }>;
  label?: string;
  variant?: "primary" | "secondary";
}

export function AddDrawingButton({
  projects,
  label,
  variant = "primary",
}: AddDrawingButtonProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const projectOptions = React.useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const fields: EntityFormField<Record<string, unknown>>[] = React.useMemo(
    () => [
      {
        name: "drawingCode",
        label: "Drawing code",
        required: true,
        placeholder: "ARC-ETV-A-001",
      },
      {
        name: "drawingNumber",
        label: "Drawing number",
        required: true,
        placeholder: "A-001",
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
        name: "drawingType",
        label: "Type",
        type: "select",
        options: DRAWING_TYPE_OPTIONS,
      },
      {
        name: "drawingPhase",
        label: "Phase",
        type: "select",
        options: DRAWING_PHASE_OPTIONS,
      },
      { name: "authorFirm", label: "Author firm", span: 2 },
    ],
    [projectOptions],
  );

  const disabled = projects.length === 0;

  async function handleSubmit(values: Record<string, unknown>) {
    await createDrawing({
      drawingCode: String(values.drawingCode ?? "").trim(),
      drawingNumber: String(values.drawingNumber ?? "").trim(),
      title: String(values.title ?? "").trim(),
      projectId: String(values.projectId ?? ""),
      drawingType: String(values.drawingType ?? "architectural") as
        | "architectural"
        | "structural"
        | "mep_electrical"
        | "mep_plumbing"
        | "mep_hvac"
        | "landscape"
        | "pool"
        | "site_plan"
        | "detail"
        | "shop_drawing"
        | "as_built"
        | "sketch"
        | "other",
      drawingPhase: values.drawingPhase
        ? (String(values.drawingPhase) as
            | "concept"
            | "schematic_design"
            | "design_development"
            | "permit_set"
            | "construction_set"
            | "as_built")
        : null,
      authorFirm: values.authorFirm ? String(values.authorFirm) : null,
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
        title={disabled ? "Create a project before adding drawings" : undefined}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        {label ?? "New drawing"}
      </Button>
      <EntityFormModal
        open={open}
        onOpenChange={setOpen}
        title="Add drawing"
        description="Drawing metadata only. Add revisions on the detail page to attach files."
        fields={fields}
        initialValues={{
          projectId: projects[0]?.id ?? "",
          drawingType: "architectural",
          drawingPhase: "",
        }}
        onSubmit={handleSubmit}
        submitLabel="Create"
      />
    </>
  );
}
