"use client";

/**
 * Wire-up (dev-OS drawings gap §1) — "Add revision" trigger on the drawing
 * detail page.
 *
 * Drawings could be created but never revised: addDrawingRevision existed
 * server-side with no UI trigger. This mirrors drawings-add-buttons.tsx
 * (createDrawing) — an <EntityFormModal>-driven Add that posts to the
 * already-org-scoped, audited addDrawingRevision typed-input action.
 *
 * documentId references an already-uploaded document (documents.id). The
 * drawings pipeline stores revisions by document reference (see schema
 * drawing_revisions.document_id FK); there is no inline uploader in the
 * create flow, so we collect the document UUID with a helper, consistent
 * with how revisions are persisted.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  EntityFormModal,
  type EntityFormField,
} from "@/components/ui/primitives";
import { addDrawingRevision } from "@/lib/development/server/drawings/drawing-actions";

interface AddRevisionButtonProps {
  drawingId: string;
}

export function AddRevisionButton({ drawingId }: AddRevisionButtonProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const fields: EntityFormField<Record<string, unknown>>[] = React.useMemo(
    () => [
      {
        name: "revisionLabel",
        label: "Revision label",
        required: true,
        placeholder: "A, B, 01, …",
      },
      {
        name: "revisionDate",
        label: "Revision date",
        type: "date",
        helper: "Defaults to today if left blank.",
      },
      {
        name: "documentId",
        label: "Document ID",
        required: true,
        span: 2,
        placeholder: "UUID of the uploaded drawing document",
        helper:
          "Paste the document ID of the already-uploaded drawing file (PDF or image).",
      },
      {
        name: "revisionReason",
        label: "Revision reason",
        type: "textarea",
        span: 2,
        placeholder: "What changed in this revision?",
      },
    ],
    [],
  );

  async function handleSubmit(values: Record<string, unknown>) {
    await addDrawingRevision({
      drawingId,
      revisionLabel: String(values.revisionLabel ?? "").trim(),
      documentId: String(values.documentId ?? "").trim(),
      revisionDate: values.revisionDate
        ? String(values.revisionDate)
        : undefined,
      revisionReason: values.revisionReason
        ? String(values.revisionReason).trim()
        : null,
    });
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-sm"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Add revision
      </button>
      <EntityFormModal
        open={open}
        onOpenChange={setOpen}
        title="Add revision"
        description="Creates a draft revision attached to an uploaded document. Move it through the lifecycle from the revisions table."
        fields={fields}
        initialValues={{ revisionDate: "" }}
        onSubmit={handleSubmit}
        submitLabel="Add revision"
      />
    </>
  );
}
