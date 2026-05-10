# 01 — Mgmt OS / Villas

This file contains 1 sample report demonstrating the format. CHECKPOINT
2 will populate the remaining Villas sub-pages
(`/dashboard/villas/[id]`, `/dashboard/villas/[id]/edit`,
`/dashboard/villas/[id]/availability`, etc.).

---

## `/dashboard/villas`

**Status**: 🟡 Half-built (Edit save works; Cancel button broken)
**Severity**: P1 (Cancel-broken violates the modal-cancel invariant)
**Source files**:
- Page: `src/app/(dashboard)/dashboard/villas/page.tsx`
- Per-row actions: `src/components/villas/villa-row-actions.tsx`
- Form: `src/features/villas/form.tsx`

### Production navigation signal
- HTTP status: `200`
- Console errors: `0`
- Network errors: `0`
- Has H1 / Main / Table / Form: `yes / yes / yes / yes`
- CTA buttons detected: `1`
- Verdict from prior run: **`USABLE (200)`** ← **harness false negative**

### Layout signal
- Uses Stage 10.D primitives:
  - `<EntityModal>` (Stage 10.D.2 — wraps the per-row Edit form)
  - `<ConfirmDialog>` (Stage 10.D.3 — wraps the Archive flow)
- Uses legacy patterns:
  - `<PageHeader>` instead of `<PageHeaderHero>`
  - Inline icon buttons rather than `<RowActionsMenu>` (Stage 10.D shipped a unified primitive that wasn't adopted here)
- Mobile responsive: yes (44px min touch targets explicit)

### Functionality signal
- **Add**: Modal opens via Stage 10.F (file analysis: `villas/page.tsx`
  uses an `<EntityFormModal>` wrapper). Production check needed.
- **Edit per row**: Modal opens with `<EntityModal>` (`villa-row-actions.tsx:65`).
  Form pre-fills from row data ✓
- **Save Changes**: Works ✓ (operator-confirmed)
- **Cancel button (in modal)**: 🔴 **BROKEN — confirmed by file analysis.**
  `<VillaForm>` renders Cancel as `<Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button>`
  (`form.tsx:55-57`) where `cancelHref` defaults to `/dashboard/villas`.
  When clicked from inside the modal on `/dashboard/villas`, the link
  navigates to the same URL — Next.js soft-navigates but the
  `<EntityModal>` `editOpen` state in the parent stays `true`, so the
  modal does not visually close. The form-cancel UX appears unresponsive.
- **Archive per row**: Works (`<ConfirmDialog>` + `archiveVillaAction`)
- **Form validation**: Works (zod schema; field errors rendered inline)

### Demo data signal
- Quantity: production check needed
- Realism: realistic (Bali villa context)
- Cross-references: villas → projects, owners (via shares), bookings
- Date sensibility: production check needed

### UI/UX vs reference screenshots
- Matches medical/recruitment/wallet vibe: **Partial**
- Big numbers: no (table-first layout; no KPI strip)
- Status pills: yes (`Badge` primitives)
- Modern card layout: no (table view dominates)
- **Gap**: villas is a candidate for the Stage 10.5.A pattern —
  4 KPIs at the top (occupancy %, revenue MTD, available nights,
  pending issues) + a card-grid view alongside the table.

### Integrations
- External services: channel-manager (Booking.com / Airbnb / Vrbo)
  via `villa.channelMappings` (Stage 6.P1)
- API key UI: lives at `/dashboard/integrations/channels` (per-channel)
- Per-villa channel-mapping UI: present on `/dashboard/villas/[id]/edit`

### Bugs found
- **Bug 1** (P1, confirmed by file analysis): Edit modal Cancel button
  is a `<Link>` that navigates to the same URL instead of calling
  `setEditOpen(false)`. Modal stays open. Reproduction: open Edit
  modal → click Cancel → modal does not close.
  - **Fix sketch**: Pass `onCancel={() => setEditOpen(false)}` to
    `<VillaForm>` and render Cancel as a `<Button onClick>` instead
    of a `<Link>`. Same fix needed on every form that's used inside
    a modal — likely a systemic issue across Stage 10.F-migrated
    forms.

### Operator-flagged behaviors
> "/dashboard/villas — Edit modal Cancel button BROKEN, Save Changes works"

- **Cancel BROKEN**: Reproduced via file analysis. Confirmed P1.
- **Save Changes works**: Consistent with file-based read.

### Recommended action for Phase 10.6.B-F
- **Priority**: P1 (likely systemic — every form used inside an
  `<EntityModal>` may have the same bug)
- **Target sub-phase**: 10.6.B (critical fixes — restore Cancel-button
  invariant for every modal form)
- **Effort estimate**: ~6h (audit every `<EntityModal>` callsite,
  thread `onCancel` prop through, replace `<Link>`-cancel with
  `<Button onClick>`-cancel)
- **Dependencies**: identify systemic scope by `grep -rln "<EntityModal>"`
- **Carry-over candidate**: no

### Screenshots
- Production state: needs CHECKPOINT 2 capture
- Reference comparison: doctor-portal modal Cancel always closes the modal
  cleanly — that's the invariant we're violating.
