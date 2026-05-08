# Missing patterns

The audit didn't find these patterns anywhere — they're absent system-wide and would be high-leverage to add:

1. **Universal confirm-on-destructive** — a shared `<ConfirmDialog>` component used by every delete/archive/revoke action. Currently each page invents its own (or skips entirely).
2. **Universal modal-Add primitive** — a shared `<EntityFormModal>` so list-then-Add is consistent. Currently mixed: some pages route to `/new`, some open Radix Dialog, some inline-form.
3. **Empty-state component** — `<EmptyState illustration title body cta />` so every list has the same empty-state shape (helpful copy + CTA).
4. **Quick-edit row affordance** — click row → side-panel edit (DrillDownPanel from 10.B), avoiding heavy navigation.
5. **Per-row action menu** — kebab → Edit / Archive / Audit / Duplicate. Currently each page picks a different layout for row actions.

These align with Phase 10.B primitives already shipped (`DrillDownPanel`); the gap is operator-side adoption + a Modal/Dialog shared primitive (Stage 10.D candidate).
