/**
 * Stage 10.E.4 — Villa-guides row actions.
 *
 * Drop-in client wrapper for the 3 list pages flagged partial-CRUD by
 * the audit:
 *
 *   /dashboard/villa-guides/sections             → kind="section"
 *   /dashboard/villa-guides/emergency-contacts   → kind="contact"
 *   /dashboard/villa-guides/neighborhood         → kind="place"
 *
 * All three already had `upsert*` actions (which handle Edit when an
 * `id` is present). Only sections had an archive action — 10.E.4 added
 * archive for the other two (and wifi, even though wifi isn't in this
 * sub-phase's wired pages — the action ships for completeness).
 *
 * The shared <RowActionsMenu> + <EntityFormModal> + <ArchiveConfirmDialog>
 * primitives compose the row UI.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Archive, ExternalLink } from "lucide-react";
import {
  RowActionsMenu,
  EntityFormModal,
  ArchiveConfirmDialog,
  type EntityFormField,
} from "@/components/ui/primitives";
import {
  upsertGuideSectionAction,
  archiveGuideSectionAction,
  upsertEmergencyContactAction,
  archiveEmergencyContactAction,
  upsertNeighborhoodPlaceAction,
  archiveNeighborhoodPlaceAction,
} from "@/features/villa-guides/actions";

export type VillaGuideEntityKind = "section" | "contact" | "place";

interface BaseRow {
  id: string;
  displayName: string;
  detailHref?: string;
  values: Record<string, unknown>;
}

const CONTACT_TYPES = [
  { value: "police", label: "Police" },
  { value: "ambulance", label: "Ambulance" },
  { value: "fire", label: "Fire" },
  { value: "medical", label: "Medical / clinic" },
  { value: "security", label: "Security" },
  { value: "concierge", label: "Concierge" },
  { value: "operations", label: "Operations" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];

const PLACE_CATEGORIES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "beach", label: "Beach" },
  { value: "cafe", label: "Cafe" },
  { value: "shop", label: "Shop" },
  { value: "supermarket", label: "Supermarket" },
  { value: "spa", label: "Spa" },
  { value: "gym", label: "Gym" },
  { value: "hospital", label: "Hospital" },
  { value: "transport", label: "Transport" },
  { value: "attraction", label: "Attraction" },
  { value: "other", label: "Other" },
];

function fieldsFor(kind: VillaGuideEntityKind): EntityFormField<Record<string, unknown>>[] {
  if (kind === "section") {
    return [
      { name: "title", label: "Title", required: true, span: 2 },
      {
        name: "sectionKey",
        label: "Section key",
        required: true,
        helper: "Stable identifier (lowercase, snake_case)",
        disabled: true,
      },
      { name: "sortOrder", label: "Sort order", type: "number" },
      { name: "guestVisible", label: "Visible to guest", type: "checkbox", span: 2 },
      { name: "bodyMd", label: "Body (markdown)", type: "textarea", span: 2 },
    ];
  }
  if (kind === "contact") {
    return [
      { name: "label", label: "Label", required: true, span: 2 },
      {
        name: "contactType",
        label: "Type",
        type: "select",
        options: CONTACT_TYPES,
        required: true,
      },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "whatsapp", label: "WhatsApp", type: "tel" },
      { name: "email", label: "Email", type: "email" },
      { name: "address", label: "Address", span: 2 },
      { name: "sortOrder", label: "Sort order", type: "number" },
      { name: "guestVisible", label: "Visible to guest", type: "checkbox" },
      { name: "notesMd", label: "Notes (markdown)", type: "textarea", span: 2 },
    ];
  }
  // place
  return [
    { name: "name", label: "Name", required: true, span: 2 },
    {
      name: "category",
      label: "Category",
      type: "select",
      options: PLACE_CATEGORIES,
      required: true,
    },
    { name: "distanceLabel", label: "Distance label", placeholder: "5 km" },
    { name: "travelTimeLabel", label: "Travel time", placeholder: "10 min" },
    { name: "address", label: "Address", span: 2 },
    { name: "googleMapsUrl", label: "Google Maps URL", span: 2 },
    { name: "imageUrl", label: "Image URL", span: 2 },
    { name: "sortOrder", label: "Sort order", type: "number" },
    { name: "guestVisible", label: "Visible to guest", type: "checkbox" },
    { name: "descriptionMd", label: "Description (markdown)", type: "textarea", span: 2 },
  ];
}

function entityWord(kind: VillaGuideEntityKind): string {
  switch (kind) {
    case "section":
      return "section";
    case "contact":
      return "emergency contact";
    case "place":
      return "place";
  }
}

export interface VillaGuidesRowActionsProps {
  kind: VillaGuideEntityKind;
  row: BaseRow;
  canWrite?: boolean;
}

export function VillaGuidesRowActions({
  kind,
  row,
  canWrite = true,
}: VillaGuidesRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const router = useRouter();

  const fields = React.useMemo(() => fieldsFor(kind), [kind]);

  async function onSubmit(values: Record<string, unknown>) {
    const merged: Record<string, unknown> = { ...row.values, ...values };
    const fd = new FormData();
    fd.append("id", row.id);
    for (const [k, v] of Object.entries(merged)) {
      if (v == null) fd.append(k, "");
      else if (typeof v === "boolean") fd.append(k, v ? "true" : "false");
      else fd.append(k, String(v));
    }
    let result;
    if (kind === "section") result = await upsertGuideSectionAction(null, fd);
    else if (kind === "contact") result = await upsertEmergencyContactAction(null, fd);
    else result = await upsertNeighborhoodPlaceAction(null, fd);
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  async function onArchive() {
    const fd = new FormData();
    fd.append("id", row.id);
    let result;
    if (kind === "section") result = await archiveGuideSectionAction(null, fd);
    else if (kind === "contact") result = await archiveEmergencyContactAction(null, fd);
    else result = await archiveNeighborhoodPlaceAction(null, fd);
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  return (
    <>
      <RowActionsMenu
        actions={[
          ...(row.detailHref
            ? [
                {
                  id: "view",
                  label: "View detail",
                  icon: ExternalLink,
                  onSelect: () => {
                    window.location.href = row.detailHref!;
                  },
                },
              ]
            : []),
          {
            id: "edit",
            label: "Edit",
            icon: Pencil,
            permitted: canWrite,
            onSelect: () => setEditOpen(true),
          },
          {
            id: "archive",
            label: "Archive",
            icon: Archive,
            tone: "danger",
            permitted: canWrite,
            separatorBefore: true,
            onSelect: () => setArchiveOpen(true),
          },
        ]}
      />
      <EntityFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit ${entityWord(kind)}`}
        description="Changes save immediately. Audit log captures the diff."
        fields={fields}
        initialValues={row.values}
        onSubmit={onSubmit}
        submitLabel="Save changes"
      />
      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={onArchive}
        entityName={row.displayName}
      />
    </>
  );
}
