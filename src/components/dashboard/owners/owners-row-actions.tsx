/**
 * Stage 10.E.3 — Owner / Share / Owner-stay row actions.
 *
 * Drop-in client wrapper for the 4 list pages flagged partial-CRUD by
 * the audit:
 *
 *   /dashboard/owners                          → kind="owner"
 *   /dashboard/shares                          → kind="share"
 *   /dashboard/owner-stays/policies            → kind="policy"
 *   /dashboard/owner-stays/equivalence-groups  → kind="equivalence_group"
 *
 * Owners already had update + archive (createOwner / updateOwner /
 * archiveOwner / unarchiveOwner). 10.E.3 added the missing edit /
 * archive functions for shares + policies + equivalence-groups; this
 * wrapper composes them into the shared <RowActionsMenu> +
 * <EntityFormModal> + <ArchiveConfirmDialog> primitives.
 *
 * Shares are a constrained edit — only sharePercent / startsOn /
 * endsOn / status mutate; ownerId / villaId / projectId / model stay
 * immutable post-create (ledger integrity).
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Archive, ArchiveRestore, ExternalLink } from "lucide-react";
import {
  RowActionsMenu,
  EntityFormModal,
  ArchiveConfirmDialog,
  type EntityFormField,
} from "@/components/ui/primitives";
import {
  archiveOwnerAction,
  unarchiveOwnerAction,
  updateOwnerAction,
} from "@/features/owners/actions";
import {
  archiveShareAction,
  updateShareAction,
} from "@/features/shares/actions";
import {
  archiveOwnerStayPolicyAction,
  updateOwnerStayPolicyAction,
  archiveEquivalenceGroupAction,
  updateEquivalenceGroupAction,
} from "@/features/owner-stays/actions";

export type OwnersEntityKind =
  | "owner"
  | "share"
  | "policy"
  | "equivalence_group";

interface BaseRow {
  id: string;
  displayName: string;
  detailHref?: string;
  values: Record<string, unknown>;
}

const OWNER_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "company", label: "Company" },
  { value: "family_office", label: "Family office" },
];

const OWNER_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "onboarding", label: "Onboarding" },
];

const SHARE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "ended", label: "Ended" },
];

const COMPENSATION_MODELS = [
  { value: "none", label: "None" },
  { value: "fixed_per_night", label: "Fixed per night" },
  { value: "management_fee_on_expected_gross", label: "Mgmt fee on expected gross" },
  { value: "percent_of_expected_gross", label: "% of expected gross" },
];

const OPERATIONAL_COST_MODELS = [
  { value: "none", label: "None" },
  { value: "actual_costs", label: "Actual costs" },
  { value: "fixed_per_stay", label: "Fixed per stay" },
  { value: "fixed_per_night", label: "Fixed per night" },
];

function fieldsFor(kind: OwnersEntityKind): EntityFormField<Record<string, unknown>>[] {
  if (kind === "owner") {
    return [
      { name: "displayName", label: "Display name", required: true, span: 2 },
      { name: "type", label: "Type", type: "select", options: OWNER_TYPES },
      { name: "status", label: "Status", type: "select", options: OWNER_STATUSES },
      { name: "legalName", label: "Legal name" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "nationality", label: "Nationality" },
      { name: "taxResidency", label: "Tax residency" },
    ];
  }
  if (kind === "share") {
    return [
      {
        name: "sharePercent",
        label: "Share %",
        type: "number",
        required: true,
        helper: "Owner / villa / pool identifiers stay immutable post-create.",
      },
      { name: "status", label: "Status", type: "select", options: SHARE_STATUSES },
      { name: "startsOn", label: "Starts on (YYYY-MM-DD)", required: true },
      { name: "endsOn", label: "Ends on (optional)" },
    ];
  }
  if (kind === "policy") {
    return [
      { name: "policyName", label: "Policy name", required: true, span: 2 },
      { name: "freeNightsPerYear", label: "Free nights / year", type: "number", required: true },
      {
        name: "freeNightsApplyToPeak",
        label: "Free nights apply to peak season",
        type: "checkbox",
      },
      { name: "requiresApproval", label: "Requires approval", type: "checkbox" },
      {
        name: "allowDisplacingGuestBookings",
        label: "Allow displacing guest bookings",
        type: "checkbox",
      },
      { name: "relocationAllowed", label: "Relocation allowed", type: "checkbox" },
      {
        name: "operationalCostModel",
        label: "Operational cost model",
        type: "select",
        options: OPERATIONAL_COST_MODELS,
      },
      {
        name: "compensationModel",
        label: "Compensation model",
        type: "select",
        options: COMPENSATION_MODELS,
      },
      {
        name: "compensationPercent",
        label: "Compensation %",
        type: "number",
        helper: "Used when compensation model is 'percent of expected gross'.",
      },
      { name: "currency", label: "Currency (3-letter)", placeholder: "USD" },
    ];
  }
  // equivalence_group
  return [
    { name: "name", label: "Group name", required: true, span: 2 },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      span: 2,
      helper: "Optional. Free text describing the swap-comparable set.",
    },
  ];
}

function entityWord(kind: OwnersEntityKind): string {
  switch (kind) {
    case "owner":
      return "owner";
    case "share":
      return "ownership share";
    case "policy":
      return "owner stay policy";
    case "equivalence_group":
      return "equivalence group";
  }
}

export interface OwnersRowActionsProps {
  kind: OwnersEntityKind;
  row: BaseRow;
  canWrite?: boolean;
}

export function OwnersRowActions({
  kind,
  row,
  canWrite = true,
}: OwnersRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const router = useRouter();

  const fields = React.useMemo(() => fieldsFor(kind), [kind]);

  // Owners carry a status (active / archived / …). When archived, the
  // per-row menu offers "Reactivate" (unarchiveOwnerAction) instead of
  // "Archive" — mirroring the archive↔unarchive toggle the action layer
  // already supports. Only owners have an unarchive action here.
  const isArchivedOwner =
    kind === "owner" && row.values.status === "archived";

  async function onSubmit(values: Record<string, unknown>) {
    // Merge: full row values are the baseline (each existing edit
    // schema requires every create-field) + user's edits override.
    const merged: Record<string, unknown> = { ...row.values, ...values };
    const fd = new FormData();
    fd.append("id", row.id);
    for (const [k, v] of Object.entries(merged)) {
      if (v == null) fd.append(k, "");
      else if (typeof v === "boolean") fd.append(k, v ? "true" : "false");
      else fd.append(k, String(v));
    }
    let result;
    if (kind === "owner") result = await updateOwnerAction(null, fd);
    else if (kind === "share") result = await updateShareAction(null, fd);
    else if (kind === "policy") result = await updateOwnerStayPolicyAction(null, fd);
    else result = await updateEquivalenceGroupAction(null, fd);
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  async function onArchive() {
    const fd = new FormData();
    fd.append("id", row.id);
    let result;
    if (kind === "owner") result = await archiveOwnerAction(null, fd);
    else if (kind === "share") result = await archiveShareAction(null, fd);
    else if (kind === "policy") result = await archiveOwnerStayPolicyAction(null, fd);
    else result = await archiveEquivalenceGroupAction(null, fd);
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  async function onUnarchive() {
    const fd = new FormData();
    fd.append("id", row.id);
    const result = await unarchiveOwnerAction(null, fd);
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
          isArchivedOwner
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
                label: kind === "share" ? "End share" : "Archive",
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
