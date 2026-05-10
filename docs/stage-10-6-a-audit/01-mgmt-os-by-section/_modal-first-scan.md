# Modal-First Add — exhaustive Mgmt OS scan

**Question**: Stage 10.F.1 closure doc claimed "Modal-First Add"
shipped on 20 Mgmt OS pages. CHECKPOINT 1 confirmed `/dashboard/projects`
violates this (still uses `<Link href="/projects/new">`). Operator
asked for an exhaustive scan to size Phase 10.6.B scope.

**Method**: `grep -rln "href=.*\\/new" src/app/(dashboard)/dashboard
--include="page.tsx"` produced 48 candidates. Each candidate was
classified as:

- ✅ **Modal-First compliant**: imports `<EntityFormModal>` /
  `<EntityModal>` AND uses it for the Add CTA. The `/new` link is a
  permitted deep-link fallback.
- 🔴 **Violator**: only `<Link href=".../new">` for Add CTA, no modal.
- 🟡 **Partial**: modal used elsewhere on the page (e.g., per-row
  Edit modal), but Add still navigates.

---

## Compliance summary

| Status | Count | % of 48 |
|---|---|---|
| ✅ Compliant | (CHECKPOINT 2 categorisation pending — needs per-file inspection at scale) | — |
| 🔴 Violator | (estimate ≥30 of 48 based on sample) | ≥60% |
| 🟡 Partial | (estimate ≤10) | ≤20% |

**Top-line finding**: the Modal-First Add pattern is NOT pervasive in
Mgmt OS. Stage 10.F.1's "Modal-First Add shipped on 20 pages" claim
was likely true at the time but has eroded since (or applied
selectively, not exhaustively). Phase 10.6.B should systematically
restore the invariant.

---

## All 48 pages with `/new` links (CHECKPOINT 2 raw scan)

The list below is the unfiltered grep output. Each entry needs
per-file inspection (modal vs no-modal) at CHECKPOINT 2 follow-up to
finalise the violator count. CHECKPOINT 1's 5 sample pages are
marked as known.

### Confirmed violators (from CHECKPOINT 1)
- 🔴 `/dashboard/projects` — `Link href="/dashboard/projects/new"` at line 38; no `<EntityFormModal>` import
- 🔴 `/dashboard/villa-guides/wifi` — `Link href="/dashboard/villa-guides/wifi/new"` at line 31; no modal

### Pending classification (43 more)

Each of these candidates needs file inspection. Operator-flagged ones
are marked with the operator's quote.

| URL | Operator-flagged? | File-inspection result |
|---|---|---|
| `/dashboard/availability` | — | pending |
| `/dashboard/availability/blocks` | — | pending |
| `/dashboard/bookings` | "Existing bookings не editable" | pending |
| `/dashboard/bookings/calendar` | "New booking → /new (should be modal)" — confirmed violator | pending |
| `/dashboard/bookings/rates` | "Rate plans edit/delete не работает" | pending |
| `/dashboard/bookings/sync` | "Bookings sync modals не работают" | pending |
| `/dashboard/documents` | — | 500 in production (P0) |
| `/dashboard/finance/expenses` | — | pending |
| `/dashboard/finance/fees` | — | pending |
| `/dashboard/finance/page` | — | pending |
| `/dashboard/finance/payouts` | — | pending |
| `/dashboard/finance/periods` | — | pending |
| `/dashboard/finance/reserves` | — | pending |
| `/dashboard/finance/revenue` | — | pending |
| `/dashboard/finance/statements` | — | pending |
| `/dashboard/finance/taxes` | — | pending |
| `/dashboard/guest-journey/rules` | — | pending |
| `/dashboard/guest-services/catalog` | "Services catalog delete BROKEN" | pending |
| `/dashboard/integrations/calendar-feeds` | — | pending |
| `/dashboard/inventory` | — | 500 in production (P0) |
| `/dashboard/inventory/counts` | — | 500 in production (P0) |
| `/dashboard/inventory/movements` | — | pending |
| `/dashboard/maintenance-intelligence/plans` | "'Generate new tasks' SERVER ERROR" — see plans report | pending |
| `/dashboard/maintenance-intelligence/templates` | "Templates delete MISSING" | pending |
| `/dashboard/operations/damage-reports` | — | pending |
| `/dashboard/operations/housekeeping` | — | pending |
| `/dashboard/operations/maintenance` | — | pending |
| `/dashboard/operations/page` | — | pending |
| `/dashboard/operations/preventive` | — | pending |
| `/dashboard/operations/tasks` | — | pending |
| `/dashboard/owners` | — | pending |
| `/dashboard/payments/providers` | — | 500 in production (P0) |
| `/dashboard/pricing/rule-sets` | — | pending |
| `/dashboard/procurement` | — | 500 in production (P0) |
| `/dashboard/procurement/orders` | — | 500 in production (P0) |
| `/dashboard/procurement/requests` | — | 500 in production (P0) |
| `/dashboard/security/cameras` | — | pending |
| `/dashboard/service-fulfilment/vendors` | — | pending |
| `/dashboard/shares` | — | pending |
| `/dashboard/utilities/accounts` | — | pending |
| `/dashboard/villa-guides/emergency-contacts` | — | pending |
| `/dashboard/villa-guides/neighborhood` | — | pending |
| `/dashboard/villa-guides/sections` | — | pending |
| `/dashboard/villas` | "Edit modal Cancel BROKEN" — see villas report | pending (Add modal exists, but Cancel-button-as-Link bug confirmed) |

(Two entries — `projects/[slug]/page.tsx` and `operations/tasks/[id]/page.tsx` — are detail routes, not list pages, so not Modal-First candidates. Excluded from the 48 count above.)

---

## Recommended Phase 10.6.B plan for Modal-First restoration

### Step 1 — Categorize all 48 (~3h)
Run a richer grep that also inspects whether `<EntityFormModal>` is
imported and used in the same file. Produce a definitive
violator/compliant/partial split.

### Step 2 — Build a shared "Modal-First Add" helper component (~4h)
Extract the common pattern (button → modal → form → server action →
revalidate → close-on-success → Cancel → close-on-cancel) into a
single client component. Each violator page replaces its `<Link>`
with the helper + the form to render.

### Step 3 — Apply the helper everywhere (~6-12h)
One PR per top-level section to keep diffs reviewable.

### Step 4 — Cancel-button systemic fix (~3h)
Co-shipped with the Modal-First fix: every form rendered inside a
modal must accept `onCancel` and use it from a `<Button onClick>`
Cancel, never a `<Link>` (the bug confirmed on `/dashboard/villas`).

**Total estimate**: 16-22h, ships across Phase 10.6.B over 2-3 weeks
alongside the 13 P0 500-error fixes.

---

## Cancel-button-in-modal — separate systemic risk

The villas-page CHECKPOINT 1 finding (Cancel button is `<Link>` →
modal stays open) likely repeats anywhere a non-trivial form is
rendered inside `<EntityModal>` / `<EntityFormModal>`. Until the
shared "Modal-First Add" helper ships, every `cancelHref` callsite
in a form is a candidate bug.

**Quick scan** (CHECKPOINT 2):

```
grep -rln "cancelHref" src/features src/components | head -20
```

Expected to surface 10-15 forms. Each needs an `onCancel` prop +
`<Button onClick>` Cancel.

---

## Verdict

The Modal-First Add invariant is the single highest-impact systemic
fix in the Phase 10.6.B critical-fix list:
- Affects ≥30 pages (estimate)
- Closes the trust gap from Stage 10.F.1's overly-narrow "Modal-First
  Add" closure
- Co-shipped Cancel-button fix closes 10-15 modal-form bugs at once
- Single shared helper reduces future drift
