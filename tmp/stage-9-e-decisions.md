# Stage 9 / Phase 9.E — Role Assignment UI — Decisions

**Date**: 2026-05-08
**Hours target**: 2 days | Tests target: ~15 | Migrations: 0
**Tests delivered**: 13 static
**Test count**: 4933 → 4946 passing (+13)

---

## Sub-items shipped

### 9.E.1 — `/dashboard/settings/team/[user_id]` member detail page

Server component. Reads the target `app_users` row + every `app_user_roles` grant (both active + revoked) ordered by `granted_at DESC`. Renders identity, current grant card with the role description's blurb + highlights, the change-role form, and a historical table of revoked / superseded grants.

The page wires "Manage" links from the team list (existing `/dashboard/settings/team`) so admins can drill into a user without typing the UUID.

Force-dynamic. Returns `notFound()` if the user UUID doesn't resolve.

### 9.E.2 — `updateUserRoleAction` server action

Added to `src/features/team/actions.ts`. Replaces the user's active grant(s) in `app_user_roles` with a single new active grant. The previous grant is preserved with `is_active=false`, `revoked_at=now()`, `revoked_by=me`, and `revocation_reason` carrying the operator's optional note (default: "role change").

**Permission gate**: `requirePermission("roles.assign")` — only `super_admin` per the existing matrix. Future expansion (e.g. plan owners delegating role assignment) lives in the matrix, not here.

**Invariants enforced**:
1. **Self-change refused** — operator must have another admin perform their own role change. Prevents accidental self-demotion lockout.
2. **Last-active-admin refused** — if the target currently has `admin` AND no other active admin exists, demotion is blocked with a "promote another user first" message.
3. **Idempotent** — if the user already has exactly the requested grant active, the action returns `{ ok: true }` without rewriting or audit-logging. Repeated form submits are safe.

**Side effect**: if the target was `suspended` (e.g. revoked previously via `revokeAccessAction`), assigning a new role flips them back to `active` — same row, no re-invitation needed.

**Audit log**: `team.user.role_changed` with `before.role_keys` (the prior list) and `after.role_key + scope + scoped_project_id`. Metadata carries the optional reason + target email so audit search by email works.

**`user_roles` is NOT touched.** The action operates exclusively on `app_user_roles` (cabinet routing). The `user_roles` → `roles.id` join table is reserved for founder + audit-bot `super_admin` grants and isn't subject to operator-driven role changes. The change-role form's footer makes this explicit.

### 9.E.3 — Role descriptions module

`src/features/team/role-descriptions.ts` — one entry per cabinet role (label + blurb + 2-4 bulleted highlights). Displayed in:
- The change-role form's help drawer (live preview as the operator picks).
- The member detail page's current-grant card.
- Easily reusable for the per-tenant AI config page (Phase 9.F) or any future role-aware surface.

`src/features/team/role-keys.ts` — pure constants split out so client components + tests can import without pulling `server-only` via the action module. Same pattern as Phase 8.B's `run-agent-config` and Phase 7.F's `cabinet-flags`.

### Test coverage

13 static tests in `tests/development-stage-9-e.test.ts`:
- Role-key enum matches migration 0066's CHECK list.
- Every role has a meaningful description (label + ≥30 char blurb + ≥2 highlights).
- Action exports + permission gate + last-admin invariant + self-change guard.
- Action soft-deletes prior grants + inserts a new one + reactivates suspended users.
- Action does NOT mutate `user_roles` (regression-guard for the founder-grant invariant).
- Member detail page renders with force-dynamic + reads both tables.
- Change-role form is a client component + uses `VALID_CABINET_ROLES` + shows highlights.
- Team list links to the detail page.
- No new migration.

Build: clean. Cron: 102 / 101 unchanged.

---

## Trade-offs + deferred items

**1. Single grant per user.** The action assumes the simplest mental model: each user has one cabinet role at a time. If a future requirement is "this user is BOTH `qs_analyst` for the company AND `project_manager` scoped to project alpha", the action would need an "additive" mode. Today it's a full-replace. The schema supports the additive path; the form just doesn't expose it.

**2. Project-specific scope hidden from the form.** Same compromise as Phase 9.D's invite form. Action accepts `scope='project_specific' + scopedProjectId`, schema's CHECK constraint enforces consistency, audit log records it. The form sticks to `company_wide` until a real customer asks for project-scoped roles. Easy to extend.

**3. No notification to the user.** The plan called for "notify user of role change" — Phase 9.D's email helper is dry-run-aware and could fire a "your role has changed" email here. Skipped because (a) it's noise for internal ops where the admin already told the teammate verbally, (b) Stage 9.H onboarding email sequence is the right venue for this notification template, (c) audit log capturing the change is already in place.

**4. Permission `roles.assign` is super_admin-only.** Per the existing matrix. A future "org owner" role (Stage 10?) might want delegated role-assignment within their org without full super_admin reach. Until then, only founders can change roles — same authority that approved them in the first place.

**5. The action cannot promote anyone to internal-bypass (`super_admin` in `user_roles`).** Deliberate. Internal users get RLS bypass via `is_internal_user()`, which is a security boundary, not a UX boundary. Granting it requires a separate, more privileged path (a future `scripts/promote-to-internal.ts` if needed).

---

## Phase 9.E acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| Member detail page | 1 | ✅ |
| Change-role form (client) | 1 | ✅ |
| `updateUserRoleAction` | 1 | ✅ |
| Role descriptions module | 1 | ✅ |
| Last-admin invariant | enforced | ✅ |
| Self-change refused | enforced | ✅ |
| Audit log | role_changed event | ✅ |
| Tests | ~15 | 13 |
| Test count | 4933 → ~4948 | 4946 (+13) |
| Build | clean | ✅ |
| `check:cron` | clean | ✅ 102 / 101 |
| New migrations | 0 | ✅ |

**STAGE 9 / PHASE 9.E ACCEPTED.**
