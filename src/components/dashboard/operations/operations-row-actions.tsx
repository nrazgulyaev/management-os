/**
 * Stage 10.E.2 — Operations list-page row actions.
 *
 * Drop-in client wrapper used by the 6 operations list pages flagged
 * partial-CRUD by the audit (tasks, housekeeping, maintenance,
 * preventive, service-requests, damage-reports). Renders a kebab menu
 * with View detail / Edit (modal) / Archive (confirm) per row.
 *
 * Edit modals expose a curated subset of fields (the operationally
 * relevant ones — full edits stay on the detail page where the same
 * actions exist). On submit, the wrapper merges the full row payload
 * with the user's edits and posts to the existing server actions:
 *
 *   task        → editOperationTaskAction      / archiveOperationTaskAction
 *   maintenance → editMaintenanceTicketAction  / archiveMaintenanceTicketAction
 *   damage      → editDamageReportAction       / archiveDamageReportAction
 *   preventive  → editPreventiveScheduleAction / archivePreventiveScheduleAction (NEW in 10.E.2)
 *   service_req → editServiceRequestAction     / archiveServiceRequestAction (NEW in 10.E.2)
 *
 * Housekeeping pages reuse `kind: "task"` since the underlying entity
 * is the same.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Archive, ExternalLink } from "lucide-react";
import {
  RowActionsMenu,
  EntityFormModal,
  ArchiveConfirmDialog,
  type EntityFormField,
} from "@/components/ui/primitives";
import {
  archiveDamageReportAction,
  archiveMaintenanceTicketAction,
  archiveOperationTaskAction,
  archivePreventiveScheduleAction,
  archiveServiceRequestAction,
  editDamageReportAction,
  editMaintenanceTicketAction,
  editOperationTaskAction,
  editPreventiveScheduleAction,
  editServiceRequestAction,
} from "@/features/operations/actions";

export type OpsEntityKind =
  | "task"
  | "maintenance"
  | "damage"
  | "preventive"
  | "service_request";

interface BaseRow {
  id: string;
  /** Used as the entity name in confirm copy + modal title. */
  displayName: string;
  /** Optional href to a detail page. When set, the kebab includes
   * "View detail". */
  detailHref?: string;
  /** Existing entity values, used to pre-fill the modal AND to satisfy
   * the existing server-action schemas (which expect every field). */
  values: Record<string, unknown>;
}

const TASK_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const MAINTENANCE_CATEGORY_OPTIONS = [
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "ac_hvac", label: "AC / HVAC" },
  { value: "appliances", label: "Appliances" },
  { value: "structural", label: "Structural" },
  { value: "garden_pool", label: "Garden / Pool" },
  { value: "general", label: "General" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom (interval days)" },
];

const SERVICE_REQUEST_TYPES = [
  { value: "amenity", label: "Amenity" },
  { value: "experience", label: "Experience" },
  { value: "transport", label: "Transport" },
  { value: "food_drink", label: "Food / drink" },
  { value: "spa", label: "Spa" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

function fieldsFor(kind: OpsEntityKind): EntityFormField<Record<string, unknown>>[] {
  if (kind === "task") {
    return [
      { name: "title", label: "Title", required: true, span: 2 },
      { name: "priority", label: "Priority", type: "select", options: TASK_PRIORITY_OPTIONS },
      { name: "scheduledFor", label: "Scheduled (YYYY-MM-DD)", placeholder: "YYYY-MM-DD" },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ];
  }
  if (kind === "maintenance") {
    return [
      { name: "title", label: "Title", required: true, span: 2 },
      { name: "issueCategory", label: "Category", type: "select", options: MAINTENANCE_CATEGORY_OPTIONS },
      { name: "severity", label: "Severity", type: "select", options: SEVERITY_OPTIONS },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ];
  }
  if (kind === "damage") {
    return [
      { name: "title", label: "Title", required: true, span: 2 },
      { name: "severity", label: "Severity", type: "select", options: SEVERITY_OPTIONS },
      { name: "estimatedCostMinor", label: "Estimated cost (minor units)", type: "number" },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ];
  }
  if (kind === "preventive") {
    return [
      { name: "name", label: "Name", required: true, span: 2 },
      { name: "category", label: "Category", required: true },
      { name: "frequency", label: "Frequency", type: "select", options: FREQUENCY_OPTIONS, required: true },
      { name: "nextDueOn", label: "Next due (YYYY-MM-DD)", required: true },
      { name: "priority", label: "Priority", type: "select", options: TASK_PRIORITY_OPTIONS },
      { name: "intervalDays", label: "Interval days (for custom)", type: "number" },
    ];
  }
  // service_request
  return [
    { name: "title", label: "Title", required: true, span: 2 },
    {
      name: "requestType",
      label: "Request type",
      type: "select",
      options: SERVICE_REQUEST_TYPES,
      required: true,
    },
    { name: "priority", label: "Priority", type: "select", options: SEVERITY_OPTIONS },
    { name: "preferredTime", label: "Preferred time (ISO)", placeholder: "YYYY-MM-DD HH:MM" },
    { name: "message", label: "Message", type: "textarea", span: 2 },
  ];
}

function entityWord(kind: OpsEntityKind): string {
  switch (kind) {
    case "task":
      return "task";
    case "maintenance":
      return "maintenance ticket";
    case "damage":
      return "damage report";
    case "preventive":
      return "schedule";
    case "service_request":
      return "service request";
  }
}

export interface OperationsRowActionsProps {
  kind: OpsEntityKind;
  row: BaseRow;
  /** When false the menu items render disabled; default true. */
  canWrite?: boolean;
}

export function OperationsRowActions({
  kind,
  row,
  canWrite = true,
}: OperationsRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const router = useRouter();

  const fields = React.useMemo(() => fieldsFor(kind), [kind]);

  async function onSubmit(values: Record<string, unknown>) {
    // Merge: full row values are the baseline (existing server-action
    // schemas expect every field) + user's edits override.
    const merged: Record<string, unknown> = { ...row.values, ...values };
    const fd = new FormData();
    for (const [k, v] of Object.entries(merged)) {
      if (v == null) fd.append(k, "");
      else if (typeof v === "boolean") fd.append(k, v ? "true" : "false");
      else if (v instanceof Date) fd.append(k, v.toISOString());
      else fd.append(k, String(v));
    }
    let result;
    if (kind === "task") {
      // Existing edit task action takes (prev, formData) — id is in
      // formData via editOperationTaskSchema.extend({id}).
      fd.append("id", row.id);
      result = await editOperationTaskAction(null, fd);
    } else if (kind === "maintenance") {
      fd.append("id", row.id);
      result = await editMaintenanceTicketAction(null, fd);
    } else if (kind === "damage") {
      fd.append("id", row.id);
      result = await editDamageReportAction(null, fd);
    } else if (kind === "preventive") {
      result = await editPreventiveScheduleAction({ id: row.id }, null, fd);
    } else {
      result = await editServiceRequestAction({ id: row.id }, null, fd);
    }
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  async function onArchive() {
    let result;
    if (kind === "task") {
      const fd = new FormData();
      fd.append("id", row.id);
      result = await archiveOperationTaskAction(null, fd);
    } else if (kind === "maintenance") {
      const fd = new FormData();
      fd.append("id", row.id);
      result = await archiveMaintenanceTicketAction(null, fd);
    } else if (kind === "damage") {
      const fd = new FormData();
      fd.append("id", row.id);
      result = await archiveDamageReportAction(null, fd);
    } else if (kind === "preventive") {
      result = await archivePreventiveScheduleAction({ id: row.id });
    } else {
      result = await archiveServiceRequestAction({ id: row.id });
    }
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
                    // Use a Link-like programmatic navigation so the
                    // kebab close + nav happen cleanly.
                    window.location.href = row.detailHref!;
                  },
                },
              ]
            : []),
          {
            id: "edit",
            label: "Edit",
            description: "Inline modal with the most-edited fields",
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

/**
 * Convenience for code-detail links — keeps the JSX site lean.
 * Render in a TD or absolute-positioned wrapper alongside the row.
 */
export function OperationsRowActionsLink({
  href,
  children,
}: {
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-xs text-ink-tertiary hover:text-ink underline underline-offset-2"
    >
      {children ?? "Open"}
    </Link>
  );
}
