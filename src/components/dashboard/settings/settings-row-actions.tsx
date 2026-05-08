/**
 * Stage 10.E.5 — Settings + integrations + security + service-fulfilment
 *                row actions.
 *
 * Drop-in client wrapper for the 5 list pages flagged partial-CRUD by
 * the audit:
 *
 *   /dashboard/settings/responsibility-scopes  → kind="scope"
 *   /dashboard/security/cameras                → kind="camera"
 *   /dashboard/payments/providers              → kind="payment_connection"
 *   /dashboard/service-fulfilment/vendors      → kind="service_vendor"
 *   /dashboard/integrations/calendar-feeds     → kind="calendar_feed"
 *
 * Most of these had Add (and partial Edit/Archive) actions already.
 * 10.E.5 added the missing pieces:
 *   - archiveSecurityCameraDeviceAction (NEW)
 *   - editCalendarFeedAction (NEW)
 *
 * Payment connections use disconnectPaymentConnectionAction as the
 * archive equivalent (it sets status -> "disconnected"); no separate
 * archive action.
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
  editResponsibilityScopeAction,
  archiveResponsibilityScopeAction,
} from "@/features/responsibility-scopes/actions";
import {
  updateSecurityCameraDeviceAction,
  archiveSecurityCameraDeviceAction,
} from "@/features/security/actions";
import { disconnectPaymentConnectionAction } from "@/lib/payment-processors/connection-actions";
import {
  updateServiceVendorAction,
  archiveServiceVendorAction,
} from "@/features/service-fulfilment/actions";
import {
  editCalendarFeedAction,
  archiveCalendarFeedAction,
} from "@/features/integrations/calendar-sync/actions";

export type SettingsEntityKind =
  | "scope"
  | "camera"
  | "payment_connection"
  | "service_vendor"
  | "calendar_feed";

interface BaseRow {
  id: string;
  displayName: string;
  detailHref?: string;
  values: Record<string, unknown>;
}

const SCOPE_TYPES = [
  { value: "operations", label: "Operations" },
  { value: "housekeeping", label: "Housekeeping" },
  { value: "maintenance", label: "Maintenance" },
  { value: "front_office", label: "Front office" },
  { value: "security", label: "Security" },
  { value: "procurement", label: "Procurement" },
  { value: "finance", label: "Finance" },
];

const CAMERA_PROVIDERS = [
  { value: "ezviz", label: "EZVIZ" },
  { value: "tplink", label: "TP-Link Tapo" },
  { value: "reolink", label: "Reolink" },
  { value: "hikvision", label: "Hikvision" },
  { value: "ubiquiti", label: "Ubiquiti UniFi Protect" },
  { value: "other", label: "Other" },
];

const FEED_TYPES = [
  { value: "ical", label: "iCal" },
  { value: "ics", label: "ICS" },
  { value: "google_calendar", label: "Google Calendar" },
];

function fieldsFor(kind: SettingsEntityKind): EntityFormField<Record<string, unknown>>[] {
  if (kind === "scope") {
    return [
      {
        name: "scopeType",
        label: "Scope type",
        type: "select",
        options: SCOPE_TYPES,
      },
      { name: "roleKey", label: "Role key (optional)", placeholder: "e.g. operations_manager" },
      { name: "taskCategory", label: "Task category (optional)" },
    ];
  }
  if (kind === "camera") {
    return [
      { name: "name", label: "Name", required: true, span: 2 },
      { name: "locationLabel", label: "Location label", required: true },
      {
        name: "provider",
        label: "Provider",
        type: "select",
        options: CAMERA_PROVIDERS,
      },
      { name: "externalAppUrl", label: "External app URL" },
      { name: "accessRole", label: "Access role" },
      { name: "notes", label: "Notes", type: "textarea", span: 2 },
    ];
  }
  if (kind === "payment_connection") {
    // Edit not exposed — credentials require crypto context. Operators
    // disconnect + reconnect to update.
    return [];
  }
  if (kind === "service_vendor") {
    return [
      { name: "displayName", label: "Display name", required: true, span: 2 },
      { name: "legalName", label: "Legal name" },
      { name: "contactName", label: "Contact name" },
      { name: "contactPhone", label: "Contact phone", type: "tel" },
      { name: "contactEmail", label: "Contact email", type: "email" },
      { name: "serviceArea", label: "Service area" },
      { name: "internalNotes", label: "Internal notes", type: "textarea", span: 2 },
    ];
  }
  // calendar_feed
  return [
    { name: "feedName", label: "Feed name", required: true, span: 2 },
    { name: "feedUrl", label: "Feed URL", required: true, span: 2 },
    {
      name: "feedType",
      label: "Type",
      type: "select",
      options: FEED_TYPES,
    },
    {
      name: "syncIntervalMinutes",
      label: "Sync interval (minutes)",
      type: "number",
      helper: "15-1440 minutes. Default 180 (3h).",
    },
  ];
}

function entityWord(kind: SettingsEntityKind): string {
  switch (kind) {
    case "scope":
      return "responsibility scope";
    case "camera":
      return "camera";
    case "payment_connection":
      return "payment connection";
    case "service_vendor":
      return "service vendor";
    case "calendar_feed":
      return "calendar feed";
  }
}

function archiveLabel(kind: SettingsEntityKind): string {
  return kind === "payment_connection" ? "Disconnect" : "Archive";
}

export interface SettingsRowActionsProps {
  kind: SettingsEntityKind;
  row: BaseRow;
  canWrite?: boolean;
}

export function SettingsRowActions({
  kind,
  row,
  canWrite = true,
}: SettingsRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const router = useRouter();

  const fields = React.useMemo(() => fieldsFor(kind), [kind]);
  const hasEdit = fields.length > 0;

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
    if (kind === "scope") result = await editResponsibilityScopeAction(null, fd);
    else if (kind === "camera") result = await updateSecurityCameraDeviceAction(null, fd);
    else if (kind === "service_vendor") result = await updateServiceVendorAction(null, fd);
    else if (kind === "calendar_feed") result = await editCalendarFeedAction(null, fd);
    else throw new Error("Edit not supported for this entity");
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  async function onArchive() {
    let result;
    if (kind === "scope") {
      const fd = new FormData();
      fd.append("id", row.id);
      result = await archiveResponsibilityScopeAction(null, fd);
    } else if (kind === "camera") {
      const fd = new FormData();
      fd.append("id", row.id);
      result = await archiveSecurityCameraDeviceAction(null, fd);
    } else if (kind === "payment_connection") {
      result = await disconnectPaymentConnectionAction({ connectionId: row.id });
    } else if (kind === "service_vendor") {
      const fd = new FormData();
      fd.append("id", row.id);
      result = await archiveServiceVendorAction(null, fd);
    } else {
      const fd = new FormData();
      fd.append("id", row.id);
      result = await archiveCalendarFeedAction(null, fd);
    }
    if (!result.ok) throw new Error("error" in result ? result.error : "Archive failed");
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
          ...(hasEdit
            ? [
                {
                  id: "edit",
                  label: "Edit",
                  icon: Pencil,
                  permitted: canWrite,
                  onSelect: () => setEditOpen(true),
                },
              ]
            : []),
          {
            id: "archive",
            label: archiveLabel(kind),
            icon: Archive,
            tone: "danger" as const,
            permitted: canWrite,
            separatorBefore: hasEdit,
            onSelect: () => setArchiveOpen(true),
          },
        ]}
      />
      {hasEdit && (
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
      )}
      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={onArchive}
        entityName={row.displayName}
      />
    </>
  );
}
