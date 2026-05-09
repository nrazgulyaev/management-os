/**
 * Stage 10.F.2 — Quality standards modal-Add button.
 *
 * Replaces the audit-flagged `<Link href="/new">` pattern with
 * <EntityFormModal>-driven Add. Re-uses the existing
 * `createQualityStandard` server action (typed-input — no FormData
 * envelope). The /new page-level route stays alive as a deep-link
 * fallback (bookmarks + external doc links).
 *
 * Quality standards are a company-wide reference entity with no
 * required FK pickers — clean fit for the modal pattern.
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
import { createQualityStandard } from "@/lib/development/server/quality-standards/quality-standard-actions";

interface AddButtonProps {
  label?: string;
  variant?: "primary" | "secondary";
}

const QUALITY_STANDARD_FIELDS: EntityFormField<Record<string, unknown>>[] = [
  { name: "standardCode", label: "Standard code", required: true, placeholder: "QS-PLASTER-001" },
  { name: "category", label: "Category", required: true, placeholder: "finishes" },
  { name: "title", label: "Title", required: true, span: 2 },
  {
    name: "acceptanceCriteria",
    label: "Acceptance criteria",
    type: "textarea",
    required: true,
    span: 2,
    helper: "What's measured + the pass threshold (e.g. 'flatness ≤ 3 mm under 2 m straightedge').",
  },
  { name: "measurementMethod", label: "Measurement method", type: "textarea", span: 2 },
  { name: "description", label: "Description", type: "textarea", span: 2 },
];

export function AddQualityStandardButton(props: AddButtonProps = {}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  async function handleSubmit(values: Record<string, unknown>) {
    await createQualityStandard({
      standardCode: String(values.standardCode ?? "").trim(),
      title: String(values.title ?? "").trim(),
      category: String(values.category ?? "").trim(),
      acceptanceCriteria: String(values.acceptanceCriteria ?? "").trim(),
      description: values.description ? String(values.description) : undefined,
      measurementMethod: values.measurementMethod
        ? String(values.measurementMethod)
        : undefined,
    });
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant={props.variant ?? "primary"}
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        {props.label ?? "New standard"}
      </Button>
      <EntityFormModal
        open={open}
        onOpenChange={setOpen}
        title="Add quality standard"
        description="Define the acceptance criteria QA inspectors will check against."
        fields={QUALITY_STANDARD_FIELDS}
        initialValues={{ category: "finishes" }}
        onSubmit={handleSubmit}
        submitLabel="Create"
      />
    </>
  );
}
