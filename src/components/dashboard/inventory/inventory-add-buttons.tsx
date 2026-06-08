/**
 * Stage 10.F.1 — Inventory modal-Add buttons.
 *
 * Replaces the audit-flagged `<Link href="/new">` pattern with
 * <EntityFormModal>-driven Add. Each button is a thin wrapper around
 * the existing `create*Action` from src/features/inventory/actions.ts.
 *
 * The /new page-level routes stay alive as deep-link fallbacks (e.g.
 * the bulk import flow still navigates to them); the menu UX uses
 * the modal flow.
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
import {
  createSupplierAction,
  createInventoryLocationAction,
  createInventoryItemAction,
  createInventoryCategoryAction,
} from "@/features/inventory/actions";

type ServerActionShape = (
  prev: { ok: boolean } | null,
  formData: FormData,
) => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> } | { ok: true; redirectTo?: string }>;

interface AddButtonProps {
  label?: string;
  variant?: "primary" | "secondary";
}

function buildFormData(values: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v == null) fd.append(k, "");
    else if (typeof v === "boolean") fd.append(k, v ? "true" : "false");
    else fd.append(k, String(v));
  }
  return fd;
}

function GenericAddButton({
  label,
  variant = "primary",
  modalTitle,
  modalDescription,
  fields,
  initialValues,
  action,
  onSuccess,
}: {
  label: string;
  variant?: "primary" | "secondary";
  modalTitle: string;
  modalDescription?: string;
  fields: EntityFormField<Record<string, unknown>>[];
  initialValues?: Record<string, unknown>;
  action: ServerActionShape;
  onSuccess?: (result: unknown) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  async function handleSubmit(values: Record<string, unknown>) {
    const fd = buildFormData(values);
    const res = await action(null, fd);
    if (!res.ok) throw new Error(res.error ?? "Create failed");
    onSuccess?.(res);
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        {label}
      </Button>
      <EntityFormModal
        open={open}
        onOpenChange={setOpen}
        title={modalTitle}
        description={modalDescription}
        fields={fields}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        submitLabel="Create"
      />
    </>
  );
}

const SUPPLIER_TYPES = [
  { value: "general", label: "General" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "distributor", label: "Distributor" },
  { value: "service_provider", label: "Service provider" },
  { value: "retailer", label: "Retailer" },
];

const LOCATION_TYPES = [
  { value: "warehouse", label: "Warehouse" },
  { value: "site_storage", label: "Site storage" },
  { value: "container", label: "Container" },
  { value: "vehicle", label: "Vehicle" },
  { value: "shop", label: "Shop" },
];

const ITEM_TYPES = [
  { value: "consumable", label: "Consumable" },
  { value: "asset", label: "Asset" },
  { value: "service", label: "Service" },
  { value: "raw_material", label: "Raw material" },
];

const SUPPLIER_FIELDS: EntityFormField<Record<string, unknown>>[] = [
  { name: "name", label: "Name", required: true, span: 2 },
  {
    name: "supplierType",
    label: "Type",
    type: "select",
    options: SUPPLIER_TYPES,
  },
  { name: "country", label: "Country" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "notes", label: "Notes", type: "textarea", span: 2 },
];

const LOCATION_FIELDS: EntityFormField<Record<string, unknown>>[] = [
  { name: "name", label: "Name", required: true, span: 2 },
  {
    name: "locationType",
    label: "Type",
    type: "select",
    options: LOCATION_TYPES,
  },
  { name: "description", label: "Description", type: "textarea", span: 2 },
];

const CATEGORY_FIELDS: EntityFormField<Record<string, unknown>>[] = [
  {
    name: "key",
    label: "Key",
    required: true,
    placeholder: "linens",
    helper: "Lowercase slug — letters, digits, underscores.",
    validate: (v) =>
      /^[a-z][a-z0-9_]*$/.test(String(v ?? ""))
        ? null
        : "Start with a letter; lowercase letters, digits, underscores only.",
  },
  { name: "name", label: "Name", required: true, span: 2 },
  { name: "defaultUnit", label: "Default unit", placeholder: "pcs" },
  { name: "isConsumable", label: "Consumable", type: "checkbox" },
];

const ITEM_FIELDS: EntityFormField<Record<string, unknown>>[] = [
  { name: "name", label: "Name", required: true, span: 2 },
  { name: "sku", label: "SKU" },
  {
    name: "itemType",
    label: "Type",
    type: "select",
    options: ITEM_TYPES,
  },
  { name: "unit", label: "Unit", required: true, placeholder: "pcs" },
  { name: "brand", label: "Brand" },
  { name: "description", label: "Description", type: "textarea", span: 2 },
];

export function AddSupplierButton(props: AddButtonProps = {}) {
  return (
    <GenericAddButton
      label={props.label ?? "New supplier"}
      variant={props.variant}
      modalTitle="Add supplier"
      modalDescription="Vendors that supply linens, chemicals, electrical, and maintenance services."
      fields={SUPPLIER_FIELDS}
      initialValues={{ supplierType: "general" }}
      action={createSupplierAction as unknown as ServerActionShape}
    />
  );
}

export function AddInventoryLocationButton(props: AddButtonProps = {}) {
  return (
    <GenericAddButton
      label={props.label ?? "New location"}
      variant={props.variant}
      modalTitle="Add storage location"
      modalDescription="Warehouses, villa storage rooms, housekeeping carts, maintenance rooms."
      fields={LOCATION_FIELDS}
      initialValues={{ locationType: "warehouse" }}
      action={createInventoryLocationAction as unknown as ServerActionShape}
    />
  );
}

export function AddInventoryCategoryButton(props: AddButtonProps = {}) {
  return (
    <GenericAddButton
      label={props.label ?? "New category"}
      variant={props.variant}
      modalTitle="Add inventory category"
      modalDescription="Tree of item categories — linens, towels, chemicals, spare parts, FF&E."
      fields={CATEGORY_FIELDS}
      initialValues={{ defaultUnit: "pcs", isConsumable: true }}
      action={createInventoryCategoryAction as unknown as ServerActionShape}
    />
  );
}

export function AddInventoryItemButton(props: AddButtonProps = {}) {
  return (
    <GenericAddButton
      label={props.label ?? "New item"}
      variant={props.variant}
      modalTitle="Add inventory item"
      modalDescription="Consumables, linens, towels, amenities, chemicals, spare parts, and equipment."
      fields={ITEM_FIELDS}
      initialValues={{ itemType: "consumable", unit: "pcs" }}
      action={createInventoryItemAction as unknown as ServerActionShape}
    />
  );
}
