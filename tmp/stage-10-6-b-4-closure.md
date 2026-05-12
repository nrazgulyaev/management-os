# Stage 10.6 / Phase 10.6.B.4 — Closure status

**Date**: 2026-05-12
**Commits this session**: 11 (985fb14 → e76e854)
**Net delta**: 46 list pages migrated, ~17 add-button wrappers, 1 shared hook, 1 shared primitive, 35 acceptance tests.

---

## What shipped

### Foundation (commits 985fb14, b66c5cc)

- **`<ModalFirstAddButton>`** primitive at `src/components/ui/primitives/modal-first-add-button.tsx` — the universal Add helper every consumer composes.
- **`useModalOrRouteForm`** hook at `src/lib/forms/use-modal-or-route-form.ts` — unifies the two submission patterns (redirect-on-success vs return-{ok}-then-router.push) into one hook. Forms accept a single `onSuccess` prop and the hook handles both modes.

### Migrated list pages (46 closed)

| PR | Section | Pages |
|---|---|---|
| 2 | Mgmt OS — villas + projects | 2 |
| 3 | Mgmt OS — villa-guides/wifi | 1 |
| 4 | Mgmt OS — bookings batch | 4 |
| 5 | Mgmt OS — finance batch | 8 |
| 6 | Mgmt OS — operations + maintenance | 8 |
| 7 | Mgmt OS — inventory + procurement + integrations | 7 |
| 8a | Mgmt OS — owners + shares + utilities + security + villa-guides extra | 7 |
| 8b | Mgmt OS — documents + availability + pricing + guest + service-fulfilment | 7 |
| 9 | Dev OS — qa-qc + specifications + method-statements | 3 |
| | **Total** | **47** (with the wifi double-count: 46) |

### Form migrations

~25 forms now accept `{ onSuccess, onCancel }` props following one of two patterns:
- **Pattern A** (redirect-on-success): `villaForm`, `projectForm`, `bookingForm`, `ownerForm`, `shareForm`, ledger forms, `documentForm`, `bookingForm`, etc. — use `useModalOrRouteForm` hook + the redirect-error sentinel.
- **Pattern B** (router.push in useEffect): `wifiForm`, `taskForm`, `maintenanceForm`, `damageForm`, etc. — wrap the navigation in `if (onSuccess) onSuccess(); else router.push(...)`.

---

## Remaining surface

17 grep matches for `href=".../new"` in list pages. Honest triage:

### Already Modal-First compliant (treat as done)

These pages render a modal-form component inline AND have a `/new` link as the "Detailed form" deep-link fallback. The audit's scan flagged them but they already follow the invariant:

- `/development-os/vendors` — renders `<VendorModalForm />`
- `/development-os/materials` — renders `<MaterialPOModalForm />`
- `/development-os/site-reports` — renders `<SiteReportModalForm />`

For these the `/new` link is intentional (and a valuable affordance for power users / shared URLs). No migration needed.

### NoItemsYet body links (not Add CTAs)

These remaining `/new` link matches are inside `<NoItemsYet addHref="..." />` body text on already-migrated pages. They're empty-state CTAs that link to the legacy full-page form — fine to leave as deep-links since the primary Add CTA in the page header is already Modal-First.

- `/dashboard/procurement/requests` (header migrated PR 7)
- `/dashboard/procurement/orders` (header migrated PR 7)
- `/dashboard/finance` hub page — inline cross-references in body text

### Genuine remaining violators (defer to a follow-up)

These need real migration work; pattern is the same recipe as the 46 already migrated:

| Page | Notes |
|---|---|
| `/development-os/banking` | Form is server-rendered inline on `/banking/new` — needs a real client form component first |
| `/development-os/distributions` | Same — inline server-rendered preview + declare form |
| `/development-os/finance/invoices` | Has `invoice-create-form.tsx` client component — straightforward |
| `/development-os/marketing/connections` | Needs investigation — provider-selection wizard |
| `/development-os/inventory/items` | Has form component — straightforward |
| `/development-os/inventory/movements` | Has form component — straightforward |
| `/development-os/procurement/purchase-requests` | Has form component — straightforward |
| `/development-os/safety` | Inline server-rendered form — needs extraction first |
| `/development-os/cabinets/site-supervisor` | Cabinet page (read-only KPI dashboard) — `/new` link likely a CTA link, not Add |
| `/dashboard/payments/providers` | Has multi-step provider-selection wizard — separate UX call |
| `/owner/stays` | Owner-side page — separate /booking flow |

**Estimate**: 4-6 of these are ~10 min each (~60 min); the other 5-6 need ~30 min each because they need form extraction first (~2.5h). Total: ~3-4h follow-up.

---

## How to resume

The canonical pattern is documented in
[`tmp/stage-10-6-b-4-status-and-continuation.md`](stage-10-6-b-4-status-and-continuation.md) (Pattern A + B + list-page recipe).

For each remaining violator:
1. Open its `/new/page.tsx` to find which form component it imports.
2. If the form is a client component (`useActionState` + dispatch): apply Pattern A — replace `useActionState` with `useModalOrRouteForm`, add `onSuccess`/`onCancel` props, ternary Cancel button.
3. If the form returns `{ok, id}` + does `router.push` in `useEffect`: apply Pattern B — prefer `onSuccess()` over `router.push` in the effect.
4. If the form is inline-server-rendered (banking, distributions, safety): extract it to a client component first.
5. Create a `<XAddButton>` wrapper in `src/components/.../` that composes `ModalFirstAddButton` with the form.
6. Edit the list page: remove the `<Link href=".../new">` button, replace with `<XAddButton {...whateverPropsItNeeds} />`, load any extra dependencies the form needs.

---

## Acceptance gate status

| Check | Result |
|---|---|
| `<ModalFirstAddButton>` primitive shipped + tested | ✅ |
| `useModalOrRouteForm` hook shipped | ✅ |
| Pattern proven on both submission styles | ✅ (Pattern A + B working) |
| Cancel-button systemic | ✅ embedded in each migration (per-form, not a separate sweep) |
| 60 violators migrated | ⏳ 46/60 (77%) — 14 deferred (per triage above) |
| Tests | ✅ 35+ new acceptance tests across PRs |
| TypeScript clean | ✅ |
| Build clean | ⏳ not run this session |
| Production audit re-run | ⏳ operator-side |

**Status**: Phase 10.6.B.4 is **largely complete** — the foundation is shipped, the pattern is proven across multiple form styles, and 46 list pages now feature inline modal Add CTAs. The remaining 14 violators follow the same recipe; they can be closed in a focused 3-4h follow-up session.

---

## Phase 10.6.B closure

After the remaining 14 violators close and operator runs the post-deploy
production audit:

1. Write `docs/stage-10-6-b-complete.md` summarizing all 4 sub-phases
   (10.6.B.1 seed + .1-fix, 10.6.B.2 + .2-fix layout, 10.6.B.3 AI runner,
   10.6.B.4 Modal-First).
2. Operator reply **"go 10.6.C"** launches UI modernization.

---

## Files added this session

```
src/components/ui/primitives/modal-first-add-button.tsx
src/lib/forms/use-modal-or-route-form.ts

src/components/villas/villa-add-button.tsx
src/components/projects/project-add-button.tsx
src/components/villa-guides/wifi-add-button.tsx
src/components/villa-guides/section-add-button.tsx
src/components/villa-guides/place-add-button.tsx
src/components/villa-guides/contact-add-button.tsx
src/components/bookings/booking-add-button.tsx
src/components/pricing/rate-plan-add-button.tsx
src/components/pricing/season-add-button.tsx (none in PR4 - pruned)
src/components/integrations/feed-add-button.tsx
src/components/finance/{expense,fee,tax,reserve,payout-batch,period,revenue,statement}-add-button.tsx
src/components/operations/{task,preventive,maintenance,damage}-add-button.tsx
src/components/maintenance-intelligence/{plan,template}-add-button.tsx
src/components/inventory/{inventory-item,movement}-add-button.tsx
src/components/inventory-counts/count-add-button.tsx
src/components/procurement/{request,order}-add-button.tsx
src/components/owners/owner-add-button.tsx
src/components/shares/share-add-button.tsx
src/components/utilities/account-add-button.tsx
src/components/security/camera-add-button.tsx
src/components/documents/document-add-button.tsx
src/components/availability/block-add-button.tsx
src/components/dynamic-pricing/rule-set-add-button.tsx
src/components/guest-journey/rule-add-button.tsx
src/components/guest-services/service-add-button.tsx
src/components/service-fulfilment/vendor-add-button.tsx
src/components/development/qa-qc/qa-qc-add-button.tsx
src/components/development/specifications/specification-add-button.tsx
src/components/development/method-statements/method-statement-add-button.tsx

tests/development-stage-10-6-b-4-helper.test.ts
tests/development-stage-10-6-b-4-pr2.test.ts
tests/development-stage-10-6-b-4-pr3.test.ts
```

~30 form files edited; ~46 list pages edited. Total LOC delta: ~+2,500 / -300.
