# 01 — Mgmt OS / Villa guides / Wi-Fi

This file contains 1 sample report demonstrating the format. CHECKPOINT
2 will populate the remaining Wi-Fi sub-pages
(`/dashboard/villa-guides/wifi/[id]`, `/dashboard/villa-guides/wifi/new`,
`/dashboard/villa-guides/wifi/migrate`).

---

## `/dashboard/villa-guides/wifi`

**Status**: 🟡 Half-built (Edit + Migrate work; Delete affordance missing)
**Severity**: P1 (operator flagged Delete as broken; reality is "missing")
**Source files**:
- List: `src/app/(dashboard)/dashboard/villa-guides/wifi/page.tsx`
- Detail (Edit): `src/app/(dashboard)/dashboard/villa-guides/wifi/[id]/page.tsx`
- Form: `src/components/villa-guides/wifi-form.tsx`
- Actions: `src/features/villa-guides/actions.ts`

### Production navigation signal
- HTTP status: `200`
- Console errors: `0`
- Network errors: `0`
- Has H1 / Main / Table / Form: `yes / yes / yes / no`
- Verdict from prior run: **`USABLE (200)`** ← **harness false negative**

### Layout signal
- Uses Stage 10.D primitives: **none** on the list page
- Uses legacy patterns:
  - `<PageHeader>` (legacy)
  - Custom `<table>` with manual `<Link>Edit</Link>` per row, no
    `<RowActionsMenu>`
  - Inline `Add Wi-Fi` link (Stage 10.F Modal-First Add not adopted)
- Mobile responsive: partial (table layout doesn't collapse to cards
  on narrow viewports)

### Functionality signal
- **Add**: navigates to `/dashboard/villa-guides/wifi/new`
  (file-confirmed: `page.tsx:31` `<Link href="/dashboard/villa-guides/wifi/new">+ Add Wi-Fi</Link>`).
  Same Modal-First Add gap as Projects.
- **Edit per row**: ✓ Works — navigates to `/dashboard/villa-guides/wifi/{id}`
  which renders `<WifiForm>`
- **Run Migration Sweep**: ✓ Works (operator-confirmed)
- **Delete per row**: 🔴 **MISSING** — file analysis confirms zero Delete
  affordance on either the list page (`page.tsx`) or the detail page
  (`[id]/page.tsx`). No `delete` / `archive` / `Archive` token in
  either file. No corresponding action in `villa-guides/actions.ts`
  for delete (no `deleteWifi*` export found).
- **Cancel button (in form)**: needs reproduction — likely the same
  systemic bug as VillaForm (full-page Cancel with `<Link>` —
  acceptable in full-page route, broken if reused inside a modal)

### Demo data signal
- Quantity: production check needed
- Realism: encrypted credentials format is realistic (Stage 6.P1.B)

### UI/UX vs reference screenshots
- Matches modern vibe: **No** (legacy table with `+1`-style Edit links)
- Big numbers: no
- Status pills: yes (encrypted / legacy / none badges)
- Modern card layout: no
- **Gap**: should adopt the cabinet-dashboard pattern with a security
  KPI ("X villas have legacy plaintext credentials") in the hero,
  then a card-per-villa view with rotation status.

### Integrations
- External services: AES-256-GCM via `STAY_LINK_KMS_SECRET`
- API key UI: n/a (encryption secret is operator-configured env)

### Bugs found
- **Bug 1** (P1): No Delete affordance per row. Operator described as
  "Delete BROKEN" but the action doesn't exist at all. Systemic
  question: should every Wi-Fi row be deletable, or only soft-archived?
  Wi-Fi credentials feed `/stay/[token]/wifi` for active guests —
  hard-delete during a stay would leave guests without network access.
  **Decision needed for 10.6.B**: implement Archive (soft-delete with
  guest-stay safeguard) or Delete (hard-delete with confirm + check
  for active stays).

### Operator-flagged behaviors
> "/dashboard/villa-guides/wifi — Edit works, Delete BROKEN,
> Run Migration Sweep works"

- **Edit works**: confirmed
- **Delete BROKEN**: actually missing (more accurate). The operator
  may have been looking for a Delete button that was never built.
  This is the kind of distinction the audit must surface — "broken"
  and "missing" lead to different fix paths.
- **Run Migration Sweep works**: consistent with file analysis
  (`/migrate` route + sweep action exist).

### Recommended action for Phase 10.6.B-F
- **Priority**: P1
- **Target sub-phase**: 10.6.B (critical fixes — implement Delete /
  Archive + Modal-First Add)
- **Effort estimate**: ~4h (add `archiveWifiCredentialAction` server
  action + `<RowActionsMenu>` per row + `<ConfirmDialog>` + handle
  active-stay safeguard; convert Add to modal)
- **Dependencies**: schema check — `villaWifiCredentials` table likely
  has no `archived_at` column yet; might need a tiny migration
- **Carry-over candidate**: no

### Screenshots
- Production state: needs CHECKPOINT 2 capture
- Reference comparison: wallet-app's transactions list has a
  three-dot row menu with Delete that opens a confirm — that's the
  pattern.
