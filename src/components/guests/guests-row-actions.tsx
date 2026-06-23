"use client";

/**
 * Per-row actions for the guests list: Edit (inline modal), Open edit page,
 * and Archive ↔ Reactivate. Mirrors OwnersRowActions — composes the shared
 * RowActionsMenu + EntityFormModal + ArchiveConfirmDialog primitives over the
 * tenancy-scoped guest actions (updateGuest / archiveGuest / unarchiveGuest).
 *
 * The edit modal round-trips every guest column (createGuestSchema requires
 * each create field), so a save never wipes an unsent column.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { Pencil, Archive, ArchiveRestore, ExternalLink } from "lucide-react";
import {
  RowActionsMenu,
  EntityFormModal,
  ArchiveConfirmDialog,
  type EntityFormField,
} from "@/components/ui/primitives";
import {
  archiveGuestAction,
  unarchiveGuestAction,
  updateGuestAction,
} from "@/features/guests/actions";

export interface GuestRowActionsRow {
  id: string;
  fullName: string;
  values: {
    fullName: string;
    email: string;
    phone: string;
    nationality: string;
    preferredLanguage: string;
    whatsapp: string;
    status: string;
  };
}

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const FIELDS: EntityFormField<GuestRowActionsRow["values"]>[] = [
  { name: "fullName", label: "Full name", required: true, span: 2 },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "nationality", label: "Nationality" },
  { name: "preferredLanguage", label: "Preferred language", placeholder: "en / id / ja" },
  { name: "whatsapp", label: "WhatsApp" },
  { name: "status", label: "Status", type: "select", options: STATUSES },
];

export function GuestsRowActions({
  row,
  canWrite = true,
}: {
  row: GuestRowActionsRow;
  canWrite?: boolean;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const router = useRouter();

  const isArchived = row.values.status === "archived";

  async function onSubmit(values: GuestRowActionsRow["values"]) {
    const merged = { ...row.values, ...values };
    const fd = new FormData();
    fd.append("id", row.id);
    for (const [k, v] of Object.entries(merged)) {
      fd.append(k, v == null ? "" : String(v));
    }
    // updateGuestAction redirect()s on success, which throws a Next redirect
    // signal. In modal context we suppress the navigation and treat it as
    // success (close + refresh). A *returned* value is always an error
    // (validation / authz / not-found) and surfaces inline in the modal.
    try {
      const result = await updateGuestAction(null, fd);
      if (result && !result.ok) throw new Error(result.error);
    } catch (err) {
      if (!isRedirectError(err)) throw err;
    }
    router.refresh();
  }

  async function onArchive() {
    const fd = new FormData();
    fd.append("id", row.id);
    const result = await archiveGuestAction(null, fd);
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  async function onUnarchive() {
    const fd = new FormData();
    fd.append("id", row.id);
    const result = await unarchiveGuestAction(null, fd);
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  return (
    <>
      <RowActionsMenu
        actions={[
          {
            id: "edit-page",
            label: "Open edit page",
            icon: ExternalLink,
            permitted: canWrite,
            onSelect: () => {
              window.location.href = `/dashboard/guests/${row.id}`;
            },
          },
          {
            id: "edit",
            label: "Quick edit",
            icon: Pencil,
            permitted: canWrite,
            onSelect: () => setEditOpen(true),
          },
          isArchived
            ? {
                id: "unarchive",
                label: "Reactivate",
                icon: ArchiveRestore,
                permitted: canWrite,
                separatorBefore: true,
                onSelect: () => {
                  void onUnarchive();
                },
              }
            : {
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
        title="Edit guest"
        description="Changes save immediately. Audit log captures the diff."
        fields={FIELDS}
        initialValues={row.values}
        onSubmit={onSubmit}
        submitLabel="Save changes"
      />
      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={onArchive}
        entityName={row.fullName}
      />
    </>
  );
}
