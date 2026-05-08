/**
 * Stage 10.E.6 — Dev-OS list-page row actions.
 *
 * Drop-in client wrapper for 6 Dev-OS list pages flagged partial-CRUD
 * by the audit:
 *
 *   /development-os/vendors                     → kind="vendor"
 *   /development-os/investors                   → kind="investor"
 *   /development-os/marketing/lead-sources      → kind="lead_source"
 *   /development-os/finance/categories          → kind="cost_category"
 *   /development-os/finance/tax-types           → kind="tax_type"
 *   /development-os/asset-types                 → kind="asset_type"
 *
 * Dev-OS actions follow a different shape from the dashboard actions:
 * they take typed object args (e.g. `updateInvestor(id, patch)`)
 * rather than FormData / ActionResult. This wrapper bridges:
 * EntityFormModal posts FormData → wrapper picks fields by kind →
 * calls the typed action with the right argument shape.
 *
 * Most actions are pre-existing. 10.E.6 added:
 *   - archiveTaxType (NEW)
 *   - updateLeadSource (NEW)
 *
 * Vendors use the existing setVendorStatus(id, "archived") for archive;
 * investors use setInvestorStatus(id, "inactive").
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
  updateVendor,
  setVendorStatus,
} from "@/lib/development/server/vendor-actions";
import {
  updateInvestor,
  setInvestorStatus,
} from "@/lib/development/server/investor-actions";
import {
  updateLeadSource,
  deactivateLeadSource,
} from "@/lib/development/server/lead-sources/lead-source-actions";
import {
  updateCostCategory,
  deactivateCostCategory,
} from "@/lib/development/server/cost-category-actions";
import {
  upsertTaxType,
  archiveTaxType,
} from "@/lib/development/server/tax/tax-actions";
import {
  updateAssetType,
  deactivateAssetType,
} from "@/lib/development/server/assets/asset-type-actions";

export type DevOsEntityKind =
  | "vendor"
  | "investor"
  | "lead_source"
  | "cost_category"
  | "tax_type"
  | "asset_type";

interface BaseRow {
  id: string;
  /** For lead_source, this is the sourceKey (the entity id is via sourceKey). */
  altId?: string;
  displayName: string;
  detailHref?: string;
  values: Record<string, unknown>;
}

const VENDOR_TYPES = [
  { value: "general_contractor", label: "General contractor" },
  { value: "subcontractor_civil", label: "Subcontractor — civil" },
  { value: "subcontractor_mep", label: "Subcontractor — MEP" },
  { value: "subcontractor_finishing", label: "Subcontractor — finishing" },
  { value: "subcontractor_landscaping", label: "Subcontractor — landscape" },
  { value: "architect_designer", label: "Architect / designer" },
  { value: "engineer_consultant", label: "Engineer / consultant" },
  { value: "permits_legal", label: "Permits / legal" },
  { value: "material_supplier", label: "Material supplier" },
  { value: "equipment_rental", label: "Equipment rental" },
  { value: "logistics_transport", label: "Logistics / transport" },
  { value: "security_services", label: "Security" },
  { value: "cleaning_services", label: "Cleaning" },
  { value: "other", label: "Other" },
];

const INVESTOR_TYPES = [
  { value: "gp", label: "GP" },
  { value: "lp_private", label: "LP — private" },
  { value: "lp_institutional", label: "LP — institutional" },
  { value: "landowner_jv", label: "Landowner JV" },
];

const ATTRIBUTION_MODELS = [
  { value: "first_touch", label: "First touch" },
  { value: "last_touch", label: "Last touch" },
  { value: "linear", label: "Linear" },
  { value: "time_decay", label: "Time decay" },
  { value: "position_based", label: "Position-based" },
];

const TAX_PAYABLE_BY = [
  { value: "company", label: "Company" },
  { value: "supplier", label: "Supplier" },
  { value: "buyer", label: "Buyer" },
  { value: "investor", label: "Investor" },
  { value: "split", label: "Split" },
];

const TAX_REPORTING_PERIOD = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "on_demand", label: "On-demand" },
];

const CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "IDR", label: "IDR" },
  { value: "EUR", label: "EUR" },
  { value: "RUB", label: "RUB" },
  { value: "USDT", label: "USDT" },
  { value: "CNY", label: "CNY" },
];

function fieldsFor(kind: DevOsEntityKind): EntityFormField<Record<string, unknown>>[] {
  if (kind === "vendor") {
    return [
      { name: "legalName", label: "Legal name", required: true, span: 2 },
      {
        name: "vendorType",
        label: "Type",
        type: "select",
        options: VENDOR_TYPES,
        required: true,
      },
      { name: "primaryEmail", label: "Email", type: "email" },
      { name: "primaryPhone", label: "Phone", type: "tel" },
      { name: "whatsappPhone", label: "WhatsApp", type: "tel" },
      { name: "address", label: "Address", span: 2 },
    ];
  }
  if (kind === "investor") {
    return [
      { name: "legalName", label: "Legal name", required: true, span: 2 },
      {
        name: "investorType",
        label: "Type",
        type: "select",
        options: INVESTOR_TYPES,
        required: true,
      },
      {
        name: "primaryCurrency",
        label: "Primary currency",
        type: "select",
        options: CURRENCIES,
      },
      { name: "contactEmail", label: "Email", type: "email" },
      { name: "contactPhone", label: "Phone", type: "tel" },
      { name: "taxResidency", label: "Tax residency (ISO country)" },
      { name: "notes", label: "Notes", type: "textarea", span: 2 },
    ];
  }
  if (kind === "lead_source") {
    return [
      { name: "displayName", label: "Display name", required: true, span: 2 },
      { name: "channelType", label: "Channel type", required: true },
      { name: "platform", label: "Platform" },
      {
        name: "isPaid",
        label: "Paid channel",
        type: "checkbox",
        helper: "Tick when this channel costs money (ads, partnerships, etc.)",
      },
      {
        name: "defaultAttributionModel",
        label: "Default attribution",
        type: "select",
        options: ATTRIBUTION_MODELS,
      },
    ];
  }
  if (kind === "cost_category") {
    return [
      { name: "name", label: "Name", required: true, span: 2 },
      {
        name: "key",
        label: "Key",
        helper: "Stable identifier (lowercase, snake_case)",
        disabled: true,
      },
      { name: "categoryType", label: "Type" },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ];
  }
  if (kind === "tax_type") {
    return [
      { name: "displayName", label: "Display name", required: true, span: 2 },
      {
        name: "typeKey",
        label: "Key",
        helper: "Stable identifier (e.g. ppn_11, ppn23_2).",
        disabled: true,
      },
      {
        name: "ratePercentage",
        label: "Rate %",
        type: "number",
        required: true,
      },
      {
        name: "payableBy",
        label: "Payable by",
        type: "select",
        options: TAX_PAYABLE_BY,
        required: true,
      },
      {
        name: "reportingPeriod",
        label: "Reporting period",
        type: "select",
        options: TAX_REPORTING_PERIOD,
      },
      { name: "reportingAuthority", label: "Reporting authority" },
      {
        name: "isIncludedInAmount",
        label: "Included in amount",
        type: "checkbox",
        helper: "Tax is part of the gross transaction amount (vs. added on top).",
      },
      { name: "notes", label: "Notes", type: "textarea", span: 2 },
    ];
  }
  // asset_type
  return [
    { name: "name", label: "Name", required: true, span: 2 },
    {
      name: "key",
      label: "Key",
      helper: "Stable identifier (lowercase, snake_case)",
      disabled: true,
    },
    { name: "description", label: "Description", type: "textarea", span: 2 },
  ];
}

function entityWord(kind: DevOsEntityKind): string {
  switch (kind) {
    case "vendor":
      return "vendor";
    case "investor":
      return "investor";
    case "lead_source":
      return "lead source";
    case "cost_category":
      return "cost category";
    case "tax_type":
      return "tax type";
    case "asset_type":
      return "asset type";
  }
}

export interface DevOsRowActionsProps {
  kind: DevOsEntityKind;
  row: BaseRow;
  canWrite?: boolean;
}

export function DevOsRowActions({
  kind,
  row,
  canWrite = true,
}: DevOsRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const router = useRouter();

  const fields = React.useMemo(() => fieldsFor(kind), [kind]);

  async function onSubmit(values: Record<string, unknown>) {
    // Merge full row + edits to satisfy schema invariants.
    const merged = { ...row.values, ...values };
    // Coerce types per kind — typed actions don't accept stringified
    // booleans / numbers like FormData does.
    const coerced: Record<string, unknown> = { ...merged };
    if (kind === "lead_source") {
      coerced.isPaid = Boolean(merged.isPaid);
    }
    if (kind === "tax_type") {
      coerced.ratePercentage = Number(merged.ratePercentage);
      coerced.isIncludedInAmount = Boolean(merged.isIncludedInAmount);
    }
    try {
      if (kind === "vendor") {
        await updateVendor(row.id, coerced as Parameters<typeof updateVendor>[1]);
      } else if (kind === "investor") {
        await updateInvestor(
          row.id,
          coerced as Parameters<typeof updateInvestor>[1],
        );
      } else if (kind === "lead_source") {
        const result = await updateLeadSource(
          row.altId ?? row.id,
          coerced as Parameters<typeof updateLeadSource>[1],
        );
        if (!result.ok) throw new Error(result.error ?? "Update failed");
      } else if (kind === "cost_category") {
        await updateCostCategory({
          id: row.id,
          ...(coerced as object),
        } as Parameters<typeof updateCostCategory>[0]);
      } else if (kind === "tax_type") {
        await upsertTaxType(coerced as Parameters<typeof upsertTaxType>[0]);
      } else {
        await updateAssetType({
          id: row.id,
          ...(coerced as object),
        } as Parameters<typeof updateAssetType>[0]);
      }
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Update failed");
    }
    router.refresh();
  }

  async function onArchive() {
    try {
      if (kind === "vendor") {
        await setVendorStatus(row.id, "blacklisted", "Archived from list view");
      } else if (kind === "investor") {
        await setInvestorStatus(row.id, "inactive");
      } else if (kind === "lead_source") {
        const result = await deactivateLeadSource(row.altId ?? row.id);
        if (!result.ok) throw new Error(result.error ?? "Deactivate failed");
      } else if (kind === "cost_category") {
        await deactivateCostCategory(row.id);
      } else if (kind === "tax_type") {
        await archiveTaxType({ id: row.id });
      } else {
        await deactivateAssetType({ id: row.id });
      }
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Archive failed");
    }
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
            label:
              kind === "vendor"
                ? "Blacklist"
                : kind === "investor" ||
                    kind === "lead_source" ||
                    kind === "cost_category" ||
                    kind === "asset_type"
                  ? "Deactivate"
                  : "Archive",
            icon: Archive,
            tone: "danger" as const,
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
        description="Changes save immediately."
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
