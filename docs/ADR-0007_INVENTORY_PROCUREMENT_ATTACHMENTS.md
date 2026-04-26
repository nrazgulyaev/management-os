# ADR-0007 — Inventory, Procurement, and Storage Attachments (v5)

Status: Accepted · 2026-04-25

## Context

v4 lit up operations execution but parked materials and procurement on
mock pages, and `task_attachments` was a metadata-only table. v5 is the
materials + storage layer:

- A real inventory ledger across warehouses, villa storage, housekeeping
  carts, and a maintenance room.
- Per-item, per-location stock with reorder thresholds.
- Eight movement types covering the full operational lifecycle: receive,
  consume, transfer, adjust, count_correction, damage, write_off,
  return_to_supplier.
- Procurement: purchase requests → approvals → purchase orders → per-line
  receiving (which generates `receive` movements automatically).
- Supabase Storage signed-upload + signed-download flow for task,
  checklist-item, and maintenance-ticket photos. Photo-required checklist
  items now actually require an attachment to complete.

## Decisions

### 1. One movement table, eight types

`inventory_movements` is the single source of truth for every change to
stock. Each row carries `from_location_id` and `to_location_id` (one or
both, depending on type), the quantity, and optional links back to a
task, checklist item, damage report, or PO line. The pure helper
`features/inventory/stock.ts::deltasFor()` maps `(type, qty)` → per-leg
delta; `applyMovement(...)` in `features/inventory/actions.ts` validates
the shape, refuses negative stock by default, and upserts
`inventory_stock_levels` for both legs. Audit-log row goes out per
movement.

### 2. Procurement lifecycle as a closed transition table

```
purchase_requests:  draft → submitted → approved → ordered
                              ↓               ↓
                              rejected/cancelled
purchase_orders:    draft → sent → confirmed → partially_received → received
                              ↓                        ↓
                              cancelled
```

`PR_TRANSITIONS` and `PO_TRANSITIONS` in
`features/procurement/schema.ts` codify the table; `canTransition()` is
the single guard. Receiving a PO line auto-flips PO status:
`partially_received` if any line has any received qty,
`received` once every line is `quantity_received >= quantity_ordered`.

`createPurchaseOrderFromRequestAction` lifts an approved request into a
PO, copies request lines, and marks the request `ordered`.

### 3. Receiving is a movement, not a side-effect

`receivePurchaseOrderLineAction` is the only path that writes a `receive`
inventory_movement against a PO line. The action:
1. Validates the line belongs to the PO.
2. Refuses zero / negative qty.
3. Calls `applyMovement({ type: "receive", to_location_id, ... })`,
   which produces both the audit entry and the stock-level upsert.
4. Updates `purchase_order_lines.quantity_received`.
5. Refreshes the parent PO status.

Because receive runs through the same path as ad-hoc movements, the
inventory ledger stays consistent regardless of how stock arrived.

### 4. Task material usage = consume + log

`createTaskMaterialUsageAction` is the field-friendly wrapper:
1. Looks up the item to capture `unit_cost_minor` + `currency` for the
   ledger row (audit trail of "what this consumption was worth at the
   time").
2. Calls `applyMovement({ type: "consume", from_location_id, task_id })`.
3. Inserts a `task_material_usage` row that points at the new movement.

Owner-chargeable items remain flagged on the item itself
(`inventory_items.owner_chargeable`); the v6 finance bridge will turn
these into expense lines automatically. We deliberately do **not** create
finance expense rows from material usage today — that's a deferred,
cross-domain integration with its own audit story.

### 5. Supabase Storage attachments — signed everything

Bucket: **`task-attachments`** (private). Path convention:

```
tasks/{taskId}/{yyyy-mm}/{uuid}-{safeFilename}
checklist-items/{checklistItemId}/{yyyy-mm}/{uuid}-{safeFilename}
maintenance/{ticketId}/{yyyy-mm}/{uuid}-{safeFilename}
```

The flow is two-step from the browser, matching Supabase's
`createSignedUploadUrl`:

1. `createSignedUploadUrlAction` (server action, gated on
   `attachments.write`) inserts a `pending` row into `task_attachments`,
   builds the path, and returns a one-shot `signedUrl` + `attachmentId`.
2. The client `PUT`s the file to that URL. On success, it calls
   `registerUploadedAttachmentAction(attachmentId)` which flips
   `upload_status: "uploaded"` and revalidates the relevant pages.

Reads use short-lived (10 minute) signed download URLs minted on demand
in `services.ts::createSignedDownloadUrl`.

**Why two-step instead of streaming through our API**: keeps the bytes
off our Node server entirely (Vercel/Edge limits don't matter), preserves
content-type, and lets the browser show a real progress bar.

### 6. New columns on `task_attachments`

- `storage_bucket`, `storage_path`, `file_name`, `mime_type`,
  `size_bytes` — the canonical reference to the stored object.
- `upload_status` (`pending | uploaded | failed`) — pending rows are
  invisible to the photo-required gate; only `uploaded` rows count.
- `signed_url_expires_at` — placeholder for cached download URLs (we
  re-mint per request today, so this stays mostly NULL).

### 7. Tightened `photo_required` enforcement

`evaluateChecklistReadiness` already had the `hasAttachment` parameter;
v4 passed it as `true`. v5 wires it in for real:
`completeChecklistAction` first calls
`countUploadedAttachmentsForChecklistItems()` and only marks
`hasAttachment: true` for items where at least one **uploaded** (not
pending) attachment exists. Result: a `done` item with `photoRequired =
true` blocks completion until the staffer actually uploads a photo.

### 8. Permissions added

- `inventory.read / write / adjust`
- `procurement.read / write / approve`
- `attachments.read / write`

Matrix highlights:
- `housekeeper`, `technician`, `concierge`: full attachments.write +
  scoped inventory.read/write.
- `procurement_manager`: full procurement (incl. approve) + inventory
  read & adjust.
- `finance_manager`: procurement.read + procurement.approve (separation
  of duties: ops-side managers raise requests, finance approves them).
- Housekeeping supervisor approves cleaning checklists (v4) AND can
  write inventory.

### 9. RLS

All 13 new tables: `ENABLE` + `FORCE` RLS, `internal_read` SELECT via
`is_internal_user()`. Two extra policies on `inventory_items` and
`inventory_stock_levels` so any active `app_users` row (i.e. signed-in
field staff) can read active items + stock — they need this to populate
the field material-usage form. Mutations stay server-action-only via
service-role.

### 10. Code conventions

`MV-YYYYMMDD-NNNN`, `PR-YYYYMMDD-NNNN`, `PO-YYYYMMDD-NNNN`, and
`CNT-YYYYMMDD-NNNN` follow the same per-day counter pattern as v4. See
`features/inventory/codes.ts` and `features/procurement/codes.ts`.

## Storage bucket setup

Run once per Supabase project:

1. **Dashboard → Storage → New bucket** named `task-attachments`. Leave
   "public bucket" **off**.
2. Default policies are fine — uploads / downloads run with the
   service-role from server actions, so no public storage policies are
   required.
3. (Optional) Add a CORS rule for your app origin if you plan to mint
   download URLs straight from the client.
4. To exercise locally, set in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`

When any of those are missing, the uploader surfaces "Supabase Storage
is not configured." and the rest of the app keeps working in mock mode.

## Test plan

- `npm run db:migrate` — applies 0006 idempotently.
- `npm run db:seed` — populates suppliers, items, stock, PR/PO.
- Field photo upload:
  1. Sign in. Visit `/field/tasks/<id>`.
  2. Tap "Upload photo", choose a JPG/PNG/WEBP/PDF ≤10 MB.
  3. Watch the progress bar; "Uploaded." appears when the
     `register_uploaded_attachment` action completes.
  4. Refresh — the gallery shows a thumbnail with a 10-min signed URL.
- Inventory movement:
  1. `/dashboard/inventory/movements/new` → choose `transfer` between
     two seeded locations. Submit. Verify
     `/dashboard/inventory/stock` reflects the new totals.
- Purchase order receiving:
  1. Open the seeded PO `PO-20260420-0001` (partially received).
  2. Receive the outstanding hand-towel line into Eternal Main Storage.
  3. PO flips to `received`; stock level for the hand towels increases
     by 80; a new `MV-…` movement appears.
- Photo-required checklist:
  1. Open a task that includes a `photo_required` checklist item.
  2. Mark the item `done`. Try to submit the checklist —
     `completeChecklistAction` rejects with `photo required but no
     attachment`.
  3. Upload a photo via the task gallery, retry — completion succeeds
     and the task moves to `needs_review`.

## What's implemented now

- Migration `drizzle/0006_inventory_procurement_attachments.sql` (idempotent).
- Drizzle schema `src/lib/db/schema/inventory.ts` + barrel + new
  task_attachments columns in `operations.ts`.
- Pure helpers: `inventory/codes.ts`, `inventory/stock.ts`,
  `procurement/codes.ts`, `procurement/schema.ts`,
  `attachments/schema.ts` (Zod + `sanitizeFilename`).
- Services: `inventory/services.ts`, `procurement/services.ts`,
  `attachments/services.ts`, `attachments/storage.ts`.
- Actions:
  `inventory/actions.ts` (suppliers, locations, categories, items,
   movements + `applyMovement`, task material usage),
  `procurement/actions.ts` (PR + PO lifecycle + receive line),
  `attachments/actions.ts` (signed upload, register, delete).
- Components:
  `inventory/{stock-status-pill,item-card,stock-table,movement-table,
   item-form,location-form,supplier-form,movement-form}`,
  `procurement/{purchase-status-pill,request-card,request-form,
   request-actions,order-form,receive-line-form}`,
  `attachments/{attachment-uploader,attachment-gallery}`,
  `field/material-usage-form`.
- Admin routes: `/dashboard/inventory{,/items,/items/new,/items/[id],
  /stock,/movements,/movements/new,/locations,/locations/new,
  /categories,/suppliers,/suppliers/new,/counts,/counts/new}`,
  `/dashboard/procurement{,/requests,/requests/new,/requests/[id],
  /orders,/orders/new,/orders/[id]}`.
- Field routes: `/field/inventory` + upgraded `/field/tasks/[id]` with
  attachment uploader, gallery, material-usage form.
- Operations: `/dashboard/operations/tasks/[id]` adds an attachments
  section + material usage; `/dashboard/operations/maintenance/[id]`
  adds attachments.
- Tests: codes, stock math, validation, transitions, attachment
  schema, photo-required enforcement, permission matrix.

## What's deferred

- **Inventory counts UI** — table + line schema exists, the count
  workflow itself ships in a follow-up.
- **Damage write-off bridge** — UI form for `write_off` against a damage
  report exists as `/dashboard/inventory/movements/new` with a
  damage-report dropdown; auto-creating a write-off from the damage
  report detail page is a v6 polish.
- **Material usage → finance expense bridge** — the data is captured
  with `owner_chargeable` flags; v6 will materialise expense lines per
  statement period.
- **Per-line PO line editor** — POs created from PRs inherit lines; the
  ad-hoc PO line editor on the order detail page is a follow-up.
- **Storage object policies** — today's bucket is service-role-only.
  Once we expose direct browser uploads (RLS-checked) we'll add
  per-prefix `storage.objects` policies.
- **Photo HEIC support** — only JPG/PNG/WEBP/PDF allowlisted. Adding
  HEIC requires either client-side conversion or `image/heic` mime
  acceptance + server-side transcoding.
