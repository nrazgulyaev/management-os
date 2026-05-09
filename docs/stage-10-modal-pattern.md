# Stage 10.F — Modal-First Add Pattern Guide

**Audience:** engineers wiring new Add flows or migrating an existing `/new` page-navigation Add to a modal.

**Why:** the Stage 10.A audit found 30 list pages where Add navigates to a `/new` page instead of opening a dialog. The page-nav pattern interrupts task flow (operator loses scroll position, filter state, the row they were about to compare against). Modal-Add keeps the operator on the list page; the modal closes, the new row appears.

---

## When to use the modal pattern

**Use modal-Add when:**
- The entity has 4–10 fields with simple types (text, number, select, checkbox, date)
- Required FK pickers are short lists (≤ 50 options) that fit in a `<select>`
- The flow is a single submit — no multi-step wizard
- The operator's mental model is "add another while I'm here" (lists where users add several in a row)

**Use a `/new` page when:**
- The entity has > 10 fields or rich content (rich-text body, complex JSON config)
- A required FK is a large list (villas, projects with hundreds of rows) — needs typeahead, autocomplete, or filter UI that doesn't fit a 512-px modal
- The flow is multi-step (project creation, contract signing, booking with payment)
- File upload / attachment workflow

The `/new` pages stay as deep-link fallbacks even after a modal-Add ships. Bulk-import flows, external doc links, and operator bookmarks continue to work.

---

## Convention

### File layout

For each module group, create a single `*-add-buttons.tsx` companion to the existing `*-row-actions.tsx` wrapper (Stage 10.E):

```
src/components/dashboard/{module}/
├── {module}-row-actions.tsx        # Stage 10.E — Edit + Archive
└── {module}-add-buttons.tsx        # Stage 10.F — Add (NEW)
```

Each file exports one `Add{Entity}Button` per entity:

```tsx
export function AddSupplierButton(props: AddButtonProps = {}) { ... }
export function AddInventoryLocationButton(props: AddButtonProps = {}) { ... }
export function AddInventoryItemButton(props: AddButtonProps = {}) { ... }
```

### Component shape

Each Add button:

1. Has a **client component** marker (`"use client"`)
2. Renders a **trigger Button** + an **`<EntityFormModal>`** from `@/components/ui/primitives`
3. Calls the **existing `create*Action`** server action (no new server-side code in 10.F)
4. **Routes-refresh on success** so the new row appears in the list

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EntityFormModal,
  type EntityFormField,
} from "@/components/ui/primitives";
import { createSupplierAction } from "@/features/inventory/actions";

const SUPPLIER_FIELDS: EntityFormField<Record<string, unknown>>[] = [
  { name: "name", label: "Name", required: true, span: 2 },
  // ... 4–8 fields total
];

export function AddSupplierButton() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  async function handleSubmit(values: Record<string, unknown>) {
    const fd = buildFormData(values);
    const res = await createSupplierAction(null, fd);
    if (!res.ok) throw new Error(res.error ?? "Create failed");
    router.refresh();
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" />
        New supplier
      </Button>
      <EntityFormModal
        open={open}
        onOpenChange={setOpen}
        title="Add supplier"
        description="..."
        fields={SUPPLIER_FIELDS}
        initialValues={{ supplierType: "general" }}
        onSubmit={handleSubmit}
        submitLabel="Create"
      />
    </>
  );
}
```

### List page integration

Replace the existing `<Link href="/new">` button in the page header AND the empty-state CTA:

```tsx
// Before
<Button asChild>
  <Link href="/dashboard/inventory/suppliers/new">
    <Plus className="w-4 h-4" />
    New supplier
  </Link>
</Button>

// After
<AddSupplierButton />
```

Also pass the same component into the `<NoItemsYet>` empty-state via `addAction`:

```tsx
<NoItemsYet
  entityLabel="suppliers"
  description="..."
  addAction={<AddSupplierButton />}
/>
```

This gives the operator the modal flow from both surfaces (header button + empty-state CTA).

---

## Field config conventions

Mirror the field config used by the corresponding row-actions Edit modal (Stage 10.E). Differences for Create vs. Edit:

| Aspect | Create (10.F) | Edit (10.E) |
|---|---|---|
| Stable identifier (`key`, `sectionKey`, `typeKey`) | required, editable | disabled (immutable) |
| Status / lifecycle fields | omitted (defaults to "active") | shown |
| Audit metadata (createdBy, etc.) | omitted (set server-side) | omitted |
| Non-essential FK pickers | omitted; set on detail page | shown if small list |

Provide `initialValues` for required fields with sensible defaults:

```tsx
initialValues={{
  supplierType: "general",
  defaultCurrency: "USD",
}}
```

This avoids the operator hitting "required" on every field.

---

## When to defer

Some Add flows aren't suited to a modal — keep them as `/new` pages:

| Page | Why deferred |
|---|---|
| `/dashboard/integrations/calendar-feeds/new` | Requires villa + channel pickers; villa list can be 100+ entries (typeahead needed; modal too small) |
| `/dashboard/projects/new` | Project setup is multi-step (basics → land → permits → schedule) |
| `/dashboard/bookings/new` | Booking has payment + guest + dates; multi-step wizard |
| `/dashboard/villa-guides/wifi/new` | Crypto context — password handling, key versioning |
| `/dashboard/contracts/new` | E-signature, document upload, complex schema |

Document the deferral in the sub-phase decisions doc with the reason. Stage 11 may revisit if operators surface a need.

---

## Don'ts

- **Don't** add new server actions in 10.F. Re-use the existing `create*Action` from the entity's `actions.ts`. If a create action doesn't exist, that's a 10.E gap (CRUD completeness), not a 10.F gap.
- **Don't** fork the `/new` page when shipping the modal. Keep the page alive — it serves bookmarks + bulk import + external doc links.
- **Don't** wrap a non-Add action in `<EntityFormModal>`. Use `<ConfirmDialog>` (10.D.1) for destructive confirms; use `<DrillDownPanel>` (10.B) for read-only detail.
- **Don't** add fields the operator must research to fill in. If the value can be defaulted at create-time, default it; let edit + detail surfaces handle the long tail.
- **Don't** call `router.push` after success. `router.refresh()` keeps the operator on the list page (the whole point of the modal pattern). If they need to drill into the just-created row, surface it via the modal's success message or via the row-actions menu.

---

## Stage 10.F.1 — completed

| Page | Add button | Server action |
|---|---|---|
| `/dashboard/inventory/suppliers` | `<AddSupplierButton>` | `createSupplierAction` |
| `/dashboard/inventory/locations` | `<AddInventoryLocationButton>` | `createInventoryLocationAction` |
| `/dashboard/inventory/items` | `<AddInventoryItemButton>` | `createInventoryItemAction` |
| `/dashboard/owner-stays/policies` | `<AddOwnerStayPolicyButton>` | `createOwnerStayPolicyAction` |
| `/dashboard/owner-stays/equivalence-groups` | `<AddEquivalenceGroupButton>` | `createEquivalenceGroupAction` |

5 pages converted. Calendar-feeds (`integrations/calendar-feeds/new`) deferred per the rule above (villa picker needs typeahead).

Pending Mgmt OS pages for 10.F follow-up:
- `/dashboard/owners` — full Add already exists at `/owners/new`; modal candidate
- `/dashboard/security/cameras` — modal candidate (small schema)
- `/dashboard/operations/preventive` + `/operations/tasks` — multi-FK; evaluate

Pending Dev OS pages for **10.F.2**:
- 16 entities already have `*-modal-form.tsx` components (vendors, lead-sources, asset-types, cost-categories, bank-accounts, transactions, etc.) — those predate 10.F; verify they follow the same convention.
- Pages with `/new` page-nav still pending: distributions, drawings, boq, method-statements, qa-qc, quality-standards, safety, banking. Same pattern as 10.F.1.
