# ADR-0003 — Auth Onboarding & Admin Workflows (Version 2.5)

**Status:** Accepted
**Date:** 2026-04-25
**Scope:** First-admin bootstrap, Supabase Auth ↔ `app_users` linkage, permission helpers, edit / archive flows, audit viewer, share-total validation, dashboard live counts.

---

## 1. Decisions

| Concern | Decision | Why |
|---|---|---|
| First admin bootstrap | Hybrid: visual `/setup/admin-bootstrap` route + CLI fallback (`scripts/bootstrap-admin.ts`) | Visual path covers normal onboarding; CLI covers recovery and CI provisioning. |
| Bootstrap guard | Open while no `super_admin` exists; locked behind `ADMIN_BOOTSTRAP_SECRET` thereafter | Avoids a chicken-and-egg "need a super-admin to grant super-admin" loop, while preventing privilege escalation later. |
| Hard delete | Forbidden for v2.5 | Replaced by `archive` / status transitions for every core entity (projects, villas, owners, bookings, channels, guests, documents, shares). |
| Permission model | Server-only `lib/auth/permissions.ts` with `requireInternalUser`, `requirePermission`, `canManageEntity`, `getCurrentUserContext` | Coarse role-key check until v3 introduces `role_permissions` join. Demo mode (no DB) is permissive on read-only flows; mutations always need DB. |
| Demo mode | Explicit `NEXT_PUBLIC_ENABLE_DEMO_MODE=1` flag | Differentiates "DB unavailable" (fallback) vs "intentional demo display". |
| Migrations | Numbered SQL files in `drizzle/*.sql`, applied in lexical order by `scripts/migrate.ts` | Idempotent, reviewable. Matches v2 strategy. |
| Audit | Append-only writes through `recordAuditEvent`, list via `listAuditEvents`, render at `/dashboard/audit` | One log for every meaningful mutation. Foundation for finance compliance in v3. |

---

## 2. Auth onboarding flow

```
    ┌─────────────────────────────────────────────────────────────┐
    │ 1. Operator signs up / signs in via Supabase Auth            │
    │ 2. Operator opens /setup/admin-bootstrap                     │
    │ 3. Page reports state:                                       │
    │      a) needs_super_admin   →  open · just submit            │
    │      b) locked_required_*   →  paste ADMIN_BOOTSTRAP_SECRET  │
    │      c) db_missing          →  show setup instructions       │
    │ 4. Submit → server action `bootstrapSuperAdminAction`        │
    │ 5. `linkSupabaseUserToSuperAdmin`:                           │
    │      • finds/creates super_admin role                        │
    │      • finds app_user by auth_user_id, then by email,        │
    │        otherwise creates one                                 │
    │      • inserts user_roles (idempotent)                       │
    │      • writes audit_events                                   │
    │ 6. Redirect to /dashboard                                    │
    └─────────────────────────────────────────────────────────────┘
```

### Why open-then-locked

The first super-admin must exist before policy checks make sense. We can't gate the very first row on a non-existent role. We compensate with two safeguards:

1. The window is short — run the bootstrap once, immediately after `npm run db:seed`.
2. Once a `super_admin` exists, the bootstrap requires `ADMIN_BOOTSTRAP_SECRET`. The visual page won't accept a submission without it.

The CLI script (`scripts/bootstrap-admin.ts`) follows the same logic — it calls the same `linkSupabaseUserToSuperAdmin` function and obeys the same guard.

### Service-role usage

Bootstrap **does not** use the Supabase service-role key. All inserts run through the standard Drizzle client over `DATABASE_URL`. The service-role key is reserved for background jobs that bypass RLS by design (none yet).

---

## 3. Permission helpers

`src/features/auth/permissions.ts`:

| Helper | Purpose |
|---|---|
| `getCurrentUserContext()` | Resolves the calling user → app_user → roles. Returns `{ mode: "demo" | "live", appUser, roles, isInternal, isSuperAdmin }`. |
| `hasPermission(ctx, "permission.key")` | Pure function — checks the role × capability matrix. |
| `requireInternalUser()` | Throws `AuthorizationError` unless caller is staff (no-op in demo). |
| `requirePermission("…")` | Throws unless caller has the permission. |
| `canManageEntity("project"|"villa"|…)` | Convenience for entity-scoped guards used inside server actions. |

The matrix (`ROLE_CAPABILITIES`) is intentionally coarse — it's the union of role keys that may perform an action. v3 will replace it with a query against `role_permissions` once that join is hot.

**Demo mode behaviour:** when `DATABASE_URL` is unset, helpers mark the context as `mode: "demo"`. List pages render mock data; create/update/archive actions still refuse to mutate (returning a clear "DB not configured" error).

---

## 4. Migration 0001

`drizzle/0001_admin_workflow_hardening.sql`:

1. **Project status** — drops the old enum (`development | soft_open | live | archived`), maps existing rows to the new enum (`planning | under_construction | active | managed | archived`), and re-applies the check constraint.
2. **Villa status** — adds `available` and `archived` to the existing operational set. Operational statuses (`occupied`, `cleaning`, `inspection`, etc.) are preserved because the design system + operations board depend on them.
3. **Owner status** — adds `inactive`.
4. **Booking channels** — adds `inactive` (paused stays as a synonym).
5. **Guests** — adds `status text NOT NULL DEFAULT 'active'` with `(active | archived)` check + index.
6. **Documents** — adds `status text NOT NULL DEFAULT 'active'` with `(active | archived)` check + index.
7. **Indexes** — `ownership_shares.status`, `bookings.check_in`, `guests.status`, `documents.status`.
8. **View** — `v_recent_audit_events` (last 200 events) for cheap read access from server pages.

The migrate script applies all `drizzle/*.sql` files in lexical order, so `0000_initial.sql` + `0001_admin_workflow_hardening.sql` produce the same end-state for fresh databases.

---

## 5. Edit + archive contract

Each affected feature module exports a small set of server actions:

- `create*Action` — Zod-validates, inserts, audit-logs, redirects to detail.
- `update*Action` — Zod-validates, updates by id, audit-logs `before` / `after`, redirects.
- `archive*Action` / `unarchive*Action` — flips status, audit-logs the transition.
- (Bookings only) `setBookingStatusAction` — explicit status transition with audit.

Each form component (`features/<entity>/form.tsx`) accepts `mode: "create" | "edit"` and `defaults`. Pages thin-wrap the form. No duplicated form layouts.

A reusable `ArchiveButton` lives in `components/admin/archive-button.tsx` and binds to whichever action you pass.

---

## 6. Share validation

`src/features/shares/totals.ts` aggregates active share percentages by villa and by project pool. The `/dashboard/shares` page surfaces:

- Per-scope total cards with `success | warning | danger` tone.
- "Exceeds 100%" / "Under-allocated" / "Fully allocated" labels.
- A header count of "needs review" groups.

Hard validation in `createShareSchema` enforces:

- `share_percent > 0 && <= 100`
- exactly one of `villa_id` / `project_id` set
- `pooled` model → must reference a project (not a villa)
- `individual` / `hybrid` → must reference a villa

DB-level constraints enforce the value range; UI-level validation provides the helpful warning UX without blocking writes (the existing `villa_id IS NOT NULL OR project_id IS NOT NULL` constraint from migration 0000 still fires when both are missing).

---

## 7. Documents (admin)

Metadata-only for now. The /dashboard/documents list and /dashboard/documents/new form persist `documents` rows with optional `storage_bucket` / `storage_path`. Real file uploads to Supabase Storage land with the finance work in v3 (statement PDFs are the first use-case).

---

## 8. Settings + audit

- `/dashboard/settings` — workspace status (DB / Supabase Auth / service role / bootstrap / demo mode / resolved permission mode), current session info with sign-out, audit shortcut.
- `/dashboard/settings/users` — `app_users` list with role assignments and Supabase auth-link status.
- `/dashboard/audit` — last 200 audit events with actor, action badge, entity reference, and a short summary diff.

---

## 9. Dashboard live counts

`features/dashboard/live-counts.ts` exposes `getLiveDashboardCounts()` which counts projects, villas, owners, in-house bookings, and 14-day upcoming check-ins. The dashboard renders a `<LivePulseStrip>` only when DB is configured; the existing `<DashboardPulse>` (mock-driven) remains as the colourful command-center summary so the page never goes empty in demo mode.

---

## 10. What remains demo / mock

- Marketing pages, owner portal, AI hub, guest stay, field tasks — unchanged.
- `getCurrentUserContext()` returns `mode: "demo"` whenever `DATABASE_URL` is missing — admin pages remain visible but mutations fail closed.
- `services/audit.ts` returns one fallback row in demo mode; `users-service` similarly.
- The booking edit page only carries fields the read service exposes (no `channelId` / `guestId` / `sourceReference` / `notes`); these become editable once the read service is widened in v3 alongside the finance ledger join.

---

## 11. Known issues / to-watch

- **`next lint` deprecation** carries forward — flat-config migration deferred (ADR-0001 §6).
- The seed only creates `roles`, `permissions`, and projects/villas/owners/etc. It does **not** insert an `app_users` row tied to a Supabase auth user. Use `/setup/admin-bootstrap` after sign-up.
- The CLI script `scripts/bootstrap-admin.ts` requires env to be loaded by Node 20's `--env-file` flag. The npm script wires this; for ad-hoc runs use `node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts`.
- `bookings/services.listBookings` does not yet return `channelId`, `guestId`, `sourceReference`, `notes` — the edit page accepts them but defaults stay null until v3.

---

## 12. Cross-reference

- ADR-0001: stack baseline.
- ADR-0002: backend foundation (drizzle, RLS strategy, services + mock fallback).
- `IMPLEMENTATION_ROADMAP.md`: v3 = Finance & Investor Reporting; v3 also brings owner-scoped RLS policies and the role × permission matrix join.
- `USER_ROLES_AND_PERMISSIONS.md`: canonical role × capability matrix.
