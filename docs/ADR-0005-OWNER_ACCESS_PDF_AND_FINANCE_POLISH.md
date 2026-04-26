# ADR-0005 — Owner Access Grants, Statement PDFs & Finance Polish (Version 3.5)

**Status:** Accepted
**Date:** 2026-04-25
**Scope:** Replace the v3 email-match owner identification with explicit
`app_users_owners` grants; ship a lightweight server-rendered PDF for owner
statements; materialise expense allocations and add reserve balance views;
polish admin and owner finance UIs.

---

## 1. Decisions

| Concern | Decision | Why |
|---|---|---|
| Owner identification | **Explicit `app_users_owners` grants** with audit-logged grant/revoke | Email match was implicit and error-prone; grants are auditable, revocable, and support multiple-grants-per-user. |
| RLS function | `current_owner_ids()` returning SETOF uuid (replaces single-uuid `current_owner_id()`) | A user may legitimately have access to multiple owner identities (delegate accountants, family-office viewers). |
| PDF engine | **`@react-pdf/renderer`** | React component model, server-only buffer rendering, no Puppeteer / browser binary, no heavy infra. |
| PDF auth | Internal route requires `owner_statement.read`; owner route resolves owner ids via `getOwnerIdsForCurrentUser()` and refuses if `statement.ownerId` isn't in the set | Defense-in-depth: server-side permission check + DB-level RLS via `current_owner_ids()`. |
| Materialised allocations | Generator deletes `expense_allocations` for the statement, then writes a fresh row per villa-direct or pool-shared expense | Idempotent for drafts; allocation reports become queryable. |
| Reserve balances | SQL view `v_reserve_balances` + service-level fallback (`listReserveBalances`) | View is fast and shareable; the service mirrors it so the app keeps working before/after view creation. |
| Hard delete | Still forbidden | Audit integrity. |

---

## 2. `app_users_owners`

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `app_user_id` | FK → `app_users(id)` ON DELETE CASCADE |
| `owner_id` | FK → `owners(id)` ON DELETE CASCADE |
| `grant_type` | `owner_portal` \| `investor_readonly` \| `finance_approver` |
| `status` | `active` \| `revoked` |
| `granted_by`, `granted_at` | Audit metadata |
| `revoked_by`, `revoked_at` | Set when revoked |
| `notes` | Free-form context |

A **partial unique index** enforces one active grant per `(app_user_id, owner_id, grant_type)`; revoked rows can coexist alongside an active one.

RLS:
- `internal_read` — every internal user can read all grants.
- `self_grant_read` — an authenticated user can read their own active grants (lets the owner portal show a "you have access to N owners" hint).

---

## 3. Updated RLS

`current_owner_id()` was rewritten to consult `app_users_owners`:
```sql
SELECT auo.owner_id
  FROM app_users_owners auo
  JOIN app_users u ON u.id = auo.app_user_id
 WHERE u.auth_user_id = auth.uid()
   AND u.status = 'active'
   AND auo.status = 'active'
 ORDER BY auo.granted_at DESC LIMIT 1
```

`current_owner_ids()` returns the full set:
```sql
RETURN QUERY
  SELECT auo.owner_id
    FROM app_users_owners auo
    JOIN app_users u ON u.id = auo.app_user_id
   WHERE u.auth_user_id = auth.uid()
     AND u.status = 'active'
     AND auo.status = 'active';
```

Policies updated:
- `owner_statements.owner_self_read` — `owner_id IN (SELECT current_owner_ids())` AND `status IN ('issued','approved','paid')`.
- `statement_lines.owner_self_lines_read` — `owner_visible = true` AND parent statement is owner-readable.
- `payout_lines.owner_self_payouts_read` — `owner_id IN (SELECT current_owner_ids())` AND `status IN ('approved','paid')`.
- `reserve_movements.owner_self_reserve_read` — owner-tagged movements only; villa/project-only movements remain internal and surface to owners through `statement_lines`.

The legacy email-match path is gone from `current_owner_id()`.

---

## 4. Owner-access management

`src/features/access-grants/`:
- `schema.ts` — Zod schemas for grant create / id forms.
- `services.ts` — `listOwnerAccessGrants`, `listAccessGrantsForOwner`, `listAccessGrantsForAppUser`, `getOwnerIdsForCurrentUser`, `findActiveGrant`.
- `actions.ts` — `createOwnerAccessGrantAction`, `revokeOwnerAccessGrantAction`, `reactivateOwnerAccessGrantAction`. All require `owner_access.manage`, audit-log every change, and refuse duplicate active grants.

Permissions added:
- `owner_access.read` → super_admin, director, finance_manager, property_manager.
- `owner_access.manage` → super_admin, director, finance_manager.

UI:
- `/dashboard/owners/[id]` — new "Owner-portal access" card listing active grants with deep-link to manage.
- `/dashboard/owners/[id]/access` — full CRUD for grants on that owner.
- `/dashboard/settings/users/[id]` — flip side; manage grants from the user's profile.

---

## 5. PDF architecture

`src/features/finance/pdf/`:
- `owner-statement-pdf.tsx` — `<OwnerStatementPdf>` rendered with `@react-pdf/renderer`. Premium A4 layout: brand row, hero with status badge, period meta + net payout, three room-metric tiles, summary table, "Why this number" bullet block, grouped line tables, fixed footer.
- `render-owner-statement-pdf.ts` — `renderOwnerStatementPdf(id, { audience })` returns `{ buffer, filename }` using the `Arconique-Statement-{statementCode}.pdf` filename helper.

Routes:
- `/dashboard/finance/statements/[id]/pdf` — internal. Requires `owner_statement.read`.
- `/owner/statements/[id]/pdf` — owner. Refuses unless the caller is internal **or** the statement's `owner_id` is in `getOwnerIdsForCurrentUser()` AND the statement status is `issued | approved | paid`.

Both routes set `Cache-Control: private, no-store` and stream `application/pdf`. Owner-only PDFs render with `audience: "owner"` so internal-only lines never appear.

---

## 6. Materialised expense allocations

The statement generator now collects an `allocationsToInsert[]` in the same loop that produces statement lines for villa-direct and project-pool expenses. After persisting the statement:

1. If we're regenerating an existing draft, delete `expense_allocations` rows tied to the statement.
2. Insert one `expense_allocations` row per allocated expense, with `statement_id`, `expense_line_id`, `villa_id`, `project_id`, `owner_id`, `ownership_share_id`, `allocation_basis` (`villa_share` or `project_pool_share`), `allocation_percent`, and `allocated_amount_minor`.
3. Audit metadata now includes `{ allocations: { count, totalMinor } }` so the audit log shows what was materialised.

Migration 0003 adds a nullable `statement_id` column + index on `expense_allocations`.

---

## 7. Reserve balances

Migration 0003 creates `v_reserve_balances` (a SQL view) aggregating `reserve_movements` by `(villa_id, project_id, owner_id, reserve_type, currency)` with `contributions_minor`, `releases_minor`, `adjustments_minor`, `balance_minor`, and `last_movement_date`.

`src/features/finance/reserve-balances.ts` mirrors the same aggregation in Drizzle so the app stays functional even if the view is dropped or if a future migration redefines it. `/dashboard/finance/reserves/balances` renders the live data.

Owner-facing reserve UI is intentionally deferred to v4 — owner-scoped reserve aggregations need to either join through `expense_allocations` or wait for an explicit owner-balance materialisation. Documented under "deferred".

---

## 8. Statement explanation

`src/features/finance/explanation.ts` exposes `generateStatementExplanation(statement, lines)` — a deterministic, AI-free summariser that produces a headline + bullets + footer from already-allocated statement lines. Used by:
- `<StatementDetail>` "Why this number" section (admin + owner).
- The PDF's "Why this number" block.

It never invents numbers — every figure comes directly from the persisted statement totals or recomputed line groupings.

---

## 9. Security notes

- The service-role key is **not** used by any v3.5 code. PDF rendering, RLS, and grant management all run as the requesting user (or use Drizzle through the standard `DATABASE_URL`).
- Owner PDF route does not call `getOwnerStatementById` after authorisation — it fetches first to check `owner_id`, then renders. The window is bounded by RLS on `owner_statements` (an unauthorised owner couldn't read the row even via the service path).
- Internal PDF route can render `draft` statements; owner PDF route refuses anything that's not `issued | approved | paid`.
- Grant duplication is prevented by `findActiveGrant()` plus a partial unique index in the DB.

---

## 10. What is implemented now

- Migration 0003 (app_users_owners + current_owner_ids + RLS refresh + expense_allocations.statement_id + v_reserve_balances).
- Drizzle schema for `app_users_owners`; `expense_allocations.statementId`.
- Permission matrix `owner_access.read` / `.manage`.
- Grants module (services, actions, schema, audit).
- `@react-pdf/renderer` integration with two route handlers.
- Statement generator materialises `expense_allocations`; explanation generator.
- Reserve balance service + admin page.
- Admin UI: `/dashboard/owners/[id]/access`, `/dashboard/settings/users/[id]`, owner detail access card.
- Statement detail (admin + owner) gets PDF download, period-lock warning, deterministic explanation, source traceability.
- Tests for grant validation, PDF filename, explanation determinism, permission matrix coverage, and migration text shape.

---

## 11. Deferred to later versions

| Item | Lands in |
|---|---|
| Owner-facing reserve balance UI | v4 |
| Auto-prorate ownership shares within a period | v4 |
| Per-action UPDATE/INSERT/DELETE policies for internal staff | v4 |
| Channel manager / OTA sync | v8 |
| Real payment rails | v8 |
| AI runtime for the Investor Assistant | v7 |
| FX auto-conversion at posting time | v4 |
| pgtap matrix tests for finance RLS | v4 |
| `app_users_owners` invitation flow (email link) | v4 |

---

## 12. Cross-reference

- ADR-0001 to ADR-0004.
- `IMPLEMENTATION_ROADMAP.md`.
- `docs/USER_ROLES_AND_PERMISSIONS.md`.
