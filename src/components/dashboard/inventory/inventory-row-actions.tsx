/**
 * Stage 10.E.1 — Inventory list-page row actions.
 *
 * Drop-in client wrapper used by the 4 inventory list pages
 * (suppliers, locations, categories, items). Renders a kebab menu
 * with Edit (opens EntityFormModal) and Archive (opens
 * ArchiveConfirmDialog) on each row. Action wiring is generic over
 * the entity kind via a discriminated `kind` prop.
 *
 * Inventory movements are intentionally NOT in this list — they're
 * event-sourced; reverse via a counter-movement, not an edit/delete.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Archive } from "lucide-react";
import {
  RowActionsMenu,
  EntityFormModal,
  ArchiveConfirmDialog,
  type EntityFormField,
} from "@/components/ui/primitives";
import {
  archiveInventoryCategoryAction,
  archiveInventoryItemAction,
  archiveInventoryLocationAction,
  archiveSupplierAction,
  updateInventoryCategoryAction,
  updateInventoryItemAction,
  updateInventoryLocationAction,
  updateSupplierAction,
} from "@/features/inventory/actions";

export type InventoryEntityKind = "supplier" | "location" | "category" | "item";

interface SupplierRow {
  id: string;
  name: string;
  supplierType: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  notes?: string | null;
}

interface LocationRow {
  id: string;
  name: string;
  locationType: string;
  description: string | null;
}

interface CategoryRow {
  id: string;
  key: string;
  name: string;
  defaultUnit: string;
  isConsumable: boolean | null;
}

interface ItemRow {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  itemType: string;
  description: string | null;
  brand: string | null;
}

type AnyRow = SupplierRow | LocationRow | CategoryRow | ItemRow;

export interface InventoryRowActionsProps {
  kind: InventoryEntityKind;
  row: AnyRow;
  /** When false the menu items render disabled; default true. */
  canWrite?: boolean;
}

const SUPPLIER_TYPES = [
  "general",
  "manufacturer",
  "distributor",
  "service_provider",
  "retailer",
];
const LOCATION_TYPES = [
  "warehouse",
  "site_storage",
  "container",
  "vehicle",
  "shop",
];
const ITEM_TYPES = ["consumable", "asset", "service", "raw_material"];

function fieldsFor(kind: InventoryEntityKind): EntityFormField<Record<string, unknown>>[] {
  if (kind === "supplier") {
    return [
      { name: "name", label: "Name", required: true, span: 2 },
      {
        name: "supplierType",
        label: "Type",
        type: "select",
        options: SUPPLIER_TYPES.map((v) => ({ value: v, label: v.replace(/_/g, " ") })),
      },
      { name: "country", label: "Country" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "notes", label: "Notes", type: "textarea", span: 2 },
    ];
  }
  if (kind === "location") {
    return [
      { name: "name", label: "Name", required: true, span: 2 },
      {
        name: "locationType",
        label: "Type",
        type: "select",
        options: LOCATION_TYPES.map((v) => ({ value: v, label: v.replace(/_/g, " ") })),
      },
      { name: "description", label: "Description", type: "textarea", span: 2 },
    ];
  }
  if (kind === "category") {
    return [
      {
        name: "key",
        label: "Key",
        required: true,
        helper: "Stable identifier (lowercase, snake_case)",
        disabled: true,
      },
      { name: "name", label: "Name", required: true },
      { name: "defaultUnit", label: "Default unit", required: true },
      {
        name: "isConsumable",
        label: "Consumable",
        type: "checkbox",
        helper: "Items in this category are consumed (vs. tracked as assets)",
      },
    ];
  }
  // item
  return [
    { name: "name", label: "Name", required: true, span: 2 },
    { name: "sku", label: "SKU" },
    {
      name: "itemType",
      label: "Type",
      type: "select",
      options: ITEM_TYPES.map((v) => ({ value: v, label: v.replace(/_/g, " ") })),
    },
    { name: "unit", label: "Unit", required: true },
    { name: "brand", label: "Brand" },
    { name: "description", label: "Description", type: "textarea", span: 2 },
  ];
}

function entityLabel(kind: InventoryEntityKind): string {
  return kind === "category"
    ? "category"
    : kind === "supplier"
      ? "supplier"
      : kind === "location"
        ? "location"
        : "item";
}

export function InventoryRowActions({
  kind,
  row,
  canWrite = true,
}: InventoryRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const router = useRouter();

  const fields = React.useMemo(() => fieldsFor(kind), [kind]);
  const initial = row as unknown as Record<string, unknown>;

  async function onSubmit(values: Record<string, unknown>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) {
      if (v == null) fd.append(k, "");
      else if (typeof v === "boolean") fd.append(k, v ? "true" : "false");
      else fd.append(k, String(v));
    }
    let result;
    if (kind === "supplier") result = await updateSupplierAction({ id: row.id }, null, fd);
    else if (kind === "location")
      result = await updateInventoryLocationAction({ id: row.id }, null, fd);
    else if (kind === "category")
      result = await updateInventoryCategoryAction({ id: row.id }, null, fd);
    else result = await updateInventoryItemAction({ id: row.id }, null, fd);
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  async function onArchive() {
    let result;
    if (kind === "supplier") result = await archiveSupplierAction({ id: row.id });
    else if (kind === "location")
      result = await archiveInventoryLocationAction({ id: row.id });
    else if (kind === "category")
      result = await archiveInventoryCategoryAction({ id: row.id });
    else result = await archiveInventoryItemAction({ id: row.id });
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }

  return (
    <>
      <RowActionsMenu
        actions={[
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
        title={`Edit ${entityLabel(kind)}`}
        description="Changes save immediately. Audit log captures the diff."
        fields={fields}
        initialValues={initial}
        onSubmit={onSubmit}
        submitLabel="Save changes"
      />
      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={onArchive}
        entityName={"name" in row ? String(row.name) : undefined}
      />
    </>
  );
}
