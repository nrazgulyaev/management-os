# Stage 10.6 / Phase 10.6.B.4 — Status + continuation guide

**Date**: 2026-05-12
**Status**: Foundation + 3 proof-of-pattern PRs shipped. Remaining
~57 violators across 7 batches (PR 4–PR 10) follow the same recipe.

---

## What shipped this session

| Commit | What |
|---|---|
| `985fb14` | `<ModalFirstAddButton>` primitive + 10 acceptance tests |
| `b66c5cc` | `useModalOrRouteForm` hook + villas + projects migration + 13 tests (PR 2) |
| `b511a07` | villa-guides/wifi migration — proves alt non-redirect pattern (PR 3) + 6 tests |

**Net delta**: 3 violators closed (villas, projects, wifi). 29 acceptance
tests added. Foundation provably reusable across BOTH form submission
patterns in the codebase (redirect-on-success + return-{ok}-then-router.push).

---

## The canonical pattern (replay this for every remaining violator)

### Pattern A — redirect-on-success forms (villas, projects)

Action signature: `(prev, fd) => Promise<{ok: false, ...}>` AND calls
`redirect(...)` on success (which throws a Next.js redirect signal).

**Form edits** (`src/features/<X>/form.tsx`):

```diff
- import { useActionState } from "react";
+ import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";

  export function XForm({
    mode,
-   cancelHref = "/dashboard/x",
+   cancelHref = "/dashboard/x",
+   onSuccess,
+   onCancel,
  }: {
    mode: "create" | "edit";
+   onSuccess?: () => void;
+   onCancel?: () => void;
  }) {
-   const [state, dispatch] = useActionState(action, initial);
+   const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
+     action,
+     { onSuccess },
+   );

-   <form action={dispatch}>
+   <form action={submitAction}>

-   <Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button>
+   {onCancel ? (
+     <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
+   ) : (
+     <Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button>
+   )}
```

### Pattern B — return-{ok}-then-router.push forms (wifi)

Action signature: `(prev, fd) => Promise<{ok: true, id} | {ok: false, ...}>`,
no redirect. Form does `router.push()` in a useEffect.

**Form edits**:

```diff
  export function XForm({
    ...,
+   onSuccess,
+   onCancel,
  }: {
    ...
+   onSuccess?: () => void;
+   onCancel?: () => void;
  }) {
    useEffect(() => {
      if (state?.ok && state.someId) {
-       router.push("/dashboard/x");
+       if (onSuccess) onSuccess();
+       else router.push("/dashboard/x");
      }
-   }, [state, router]);
+   }, [state, router, onSuccess]);

-   <Button onClick={() => router.back()}>Cancel</Button>
+   <Button onClick={() => (onCancel ? onCancel() : router.back())}>Cancel</Button>
```

### List page edits (both patterns)

1. NEW `src/components/<area>/<x>-add-button.tsx`:

```tsx
"use client";
import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { XForm } from "@/features/x/form"; // or wherever the form lives

export function XAddButton({ /* whatever the form needs */ }: {...}) {
  return (
    <ModalFirstAddButton
      label="Add X"
      modalTitle="New X"
      modalDescription="..."
      formComponent={XForm}
      formProps={{ mode: "create" as const, /* ... */ }}
      newRouteHref="/dashboard/x/new"
      size="xl"  // or lg/md depending on form complexity
      testId="x-add-trigger"
    />
  );
}
```

2. List page (`src/app/.../page.tsx`):

```diff
- import { Plus } from "lucide-react";
+ import { XAddButton } from "@/components/x/x-add-button";

- <Button asChild>
-   <Link href="/dashboard/x/new">
-     <Plus className="w-4 h-4" strokeWidth={1.75} />
-     Add X
-   </Link>
- </Button>
+ <XAddButton {...whateverPropsItNeeds} />
```

**Keep the `/new/page.tsx` route file — it's the deep-link fallback.**

---

## Remaining violators (57 across 7 batches)

Counts based on `grep -rln 'href="[^"]*/new"' src/app/ --include="page.tsx"`
(62 total minus 3 already migrated minus 2 outliers that aren't list-page
Add CTAs: site-supervisor cabinet + owner/stays).

### PR 4 — bookings (4 violators)
- `dashboard/bookings/page.tsx`
- `dashboard/bookings/calendar/page.tsx`
- `dashboard/bookings/rates/page.tsx`
- `dashboard/bookings/sync/page.tsx`

Form: `src/features/bookings/form.tsx` already uses cancelHref Link pattern.
Operator-flagged: "Bookings sync modals не работают", "Rate plans
edit/delete не работает".

### PR 5 — finance (8 violators)
- `dashboard/finance/page.tsx`
- `dashboard/finance/expenses/page.tsx`
- `dashboard/finance/fees/page.tsx`
- `dashboard/finance/payouts/page.tsx`
- `dashboard/finance/periods/page.tsx`
- `dashboard/finance/reserves/page.tsx`
- `dashboard/finance/revenue/page.tsx`
- `dashboard/finance/statements/page.tsx`
- `dashboard/finance/taxes/page.tsx`

(9 actually — let me recount: 8 plus the parent /finance.)

Forms live in `src/features/finance/*` or `src/components/finance/*` —
verify per-form before migrating.

### PR 6 — operations + maintenance (7 violators)
- `dashboard/operations/page.tsx`
- `dashboard/operations/tasks/page.tsx`
- `dashboard/operations/housekeeping/page.tsx`
- `dashboard/operations/maintenance/page.tsx`
- `dashboard/operations/preventive/page.tsx`
- `dashboard/operations/damage-reports/page.tsx`
- `dashboard/maintenance-intelligence/plans/page.tsx`
- `dashboard/maintenance-intelligence/templates/page.tsx`

Forms in `src/components/operations/` use `<a href={cancelHref}>` not
`<Link>` — minor variant of Pattern A; same migration steps apply.

### PR 7 — inventory + procurement + payments + integrations (6 violators)
- `dashboard/inventory/page.tsx`
- `dashboard/inventory/counts/page.tsx`
- `dashboard/inventory/movements/page.tsx`
- `dashboard/procurement/page.tsx`
- `dashboard/procurement/orders/page.tsx`
- `dashboard/procurement/requests/page.tsx`
- `dashboard/payments/providers/page.tsx`
- `dashboard/integrations/calendar-feeds/page.tsx`

### PR 8 — other Mgmt OS (~10 violators)
- `dashboard/owners/page.tsx`
- `dashboard/shares/page.tsx`
- `dashboard/villa-guides/sections/page.tsx`
- `dashboard/villa-guides/neighborhood/page.tsx`
- `dashboard/villa-guides/emergency-contacts/page.tsx`
- `dashboard/utilities/accounts/page.tsx`
- `dashboard/security/cameras/page.tsx`
- `dashboard/pricing/rule-sets/page.tsx`
- `dashboard/guest-journey/rules/page.tsx`
- `dashboard/guest-services/catalog/page.tsx`
- `dashboard/service-fulfilment/vendors/page.tsx`
- `dashboard/documents/page.tsx`

### PR 9 — Dev OS section A (~9 violators)
- `development-os/banking/page.tsx`
- `development-os/distributions/page.tsx`
- `development-os/finance/invoices/page.tsx`
- `development-os/materials/page.tsx`
- `development-os/method-statements/page.tsx`
- `development-os/qa-qc/page.tsx`
- `development-os/safety/page.tsx`
- `development-os/specifications/page.tsx`
- `development-os/vendors/page.tsx`

### PR 10 — Dev OS section B (~6 violators)
- `development-os/inventory/items/page.tsx`
- `development-os/inventory/movements/page.tsx`
- `development-os/marketing/connections/page.tsx`
- `development-os/procurement/purchase-requests/page.tsx`
- `development-os/site-reports/page.tsx`

---

## Final regression sweep (PR 11)

After all batches land:

1. **Scan re-run** — expect 0 results:
   ```bash
   grep -rln 'href="[^"]*/new"' src/app/ --include="page.tsx" \
     | xargs grep -l '+ Add\|+ New\|Add new'
   ```

2. **Cancel-button scan re-run** — every form-with-cancelHref must have
   the `onCancel` ternary branch:
   ```bash
   grep -rln 'href={cancelHref}' src/features src/components \
     | while read f; do
         grep -L 'onCancel' "$f"
       done
   ```
   Expect 0 results.

3. **Production audit** — 0 NEW BROKEN vs. post-10.6.B.2-fix baseline:
   ```bash
   node --env-file=.env.audit.local --import tsx scripts/audit-production-pages.ts \
     --auth --concurrency=2 --timeout=45000 \
     --out=tmp/audit-post-10-6-b-4.json
   ```

4. **Operator spot-checks**:
   - Click "+ Add X" on 5 random list pages → modal opens (no navigation)
   - Click Cancel inside modal → modal closes (no navigation)
   - Open `/dashboard/villas/new` directly → /new route still renders the full-page form (deep-link survival)

---

## Phase 10.6.B closure (after PR 11 acceptance gate)

| Check | Verification |
|---|---|
| All 60 violators migrated | scan re-run shows 0 |
| All cancelHref forms have onCancel branch | scan re-run shows 0 violations |
| /new deep-link routes preserved | manual open of 3 |
| Production: 0 NEW BROKEN | re-run audit harness |
| Tests | foundation 29 + per-PR sweeps ~70 = ~5740 total |
| TypeScript clean | `npx tsc --noEmit` |

Write `docs/stage-10-6-b-complete.md` summarizing all 4 sub-phases +
production verification status. Operator reply **"go 10.6.C"** launches
UI modernization against the now-clean surface.

---

## Open methodology questions (defer-able)

1. **Should `<ModalFirstAddButton>` ALWAYS render "Open as full page" link?**
   Currently optional via `newRouteHref` prop. Recommend keeping it always-
   on for any list page that still has a `/new` route. Cost: 1 footer link.
   Benefit: shared URLs + bookmarks keep working.

2. **What about per-row Edit modals?** Out of scope for 10.6.B.4 — those
   are typically `[id]/edit` routes. If operator wants those modalized
   too, that's a follow-up sub-phase (separate audit + scan).

3. **Should we delete the `/new/page.tsx` route files altogether?**
   Recommend: NO. They're 1 file each, low maintenance, and preserve
   deep-linkability. Stage 10.6.C UI modernization can revisit if needed.

---

## Next session resume

When the operator says **"continue 10.6.B.4"**:

1. Read this doc.
2. Start with PR 4 (bookings) — operator-flagged as high-priority.
3. For each violator: apply the Pattern A or Pattern B recipe above.
4. Ship 1 commit per PR batch with structural acceptance tests.
5. After PR 10 lands → PR 11 regression sweep → operator review → 10.6.B closure.

**Estimated remaining time**: ~7-10h focused work (faster than the
original 26h estimate because the foundation + 2 patterns are proven).
