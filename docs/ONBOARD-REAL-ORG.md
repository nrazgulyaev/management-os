# Onboarding a real tenant org + admin login (no demo data)

This is the verified runbook for creating **one real organization** + **one
login-capable super-admin**, with **zero demo/business data**. Built for
onboarding `Arconique Management` as the first real tenant, but the script is
generic.

> **You run every step yourself.** A sandboxed agent cannot reach the live DB
> or your Supabase project. The deliverable is the idempotent script
> `scripts/provision-org.ts` (npm `provision:org`) + the one Supabase step only
> you can do.

## The one architectural fact that surprises people

There is **no subdomain → org mapping**. `management.arconique.com` is resolved
by middleware only to an HTTP header (`x-product: management`); it never looks
up an organization. The org is resolved **entirely from the signed-in user**
(`requireOrgId()` → `app_users.organization_id`). So you don't "point a
subdomain at the org" — you bind the org to the **user**, and that user signs
in at `management.arconique.com`. There is no slug/subdomain column to fill.
The only unique tenant key is `organizations.organization_code`.

---

## 1. Prereqs

**1a. The live DB must be migrated through `0087`.** That migration creates the
idempotent `public.provision_app_user()` function this script calls. Quick check
against the live DB:

```bash
psql "$DIRECT_URL" -c "SELECT proname FROM pg_proc WHERE proname='provision_app_user';"
```

If it returns no row, run `npm run db:migrate` first.

**1b. Env where you run the script** (your machine pointed at prod, or a prod shell):

- `DATABASE_URL` — live management DB (pooled). **Required.**
- `DIRECT_URL` — live DB direct connection. Used by `db:migrate` and the `psql` checks above.
- `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` — only if you create the Supabase auth user via the admin API (Option B below). Not needed for the dashboard path.

**1c. Demo flags must be OFF in prod:** `NEXT_PUBLIC_ENABLE_DEMO_MODE` unset/≠`1`
and `ARCONIQUE_FORCE_MOCK` unset. (With a real `DATABASE_URL` the mock fallbacks
are unreachable anyway, but `ARCONIQUE_FORCE_MOCK=1` in prod is a hard gate
failure that forces the whole app onto in-memory mock data.)

**1d. Never run a `seed:*` script against prod.** Org creation does **not**
auto-seed — the new org starts empty. See §5c for the one demo-leak caveat.

---

## 2. Create the Supabase auth user (you do this — the script can't)

Login is **email + password** (no magic-link/OAuth). Create the sign-in identity first:

**Option A — Supabase Dashboard (recommended):** Supabase project →
**Authentication → Users → Add user → Create new user**. Enter the admin email +
a password, and **check "Auto Confirm User"**. Copy the resulting **User UID**.

**Option B — Admin API (scriptable):** with `SUPABASE_SERVICE_ROLE_KEY` set, call
`supabase.auth.admin.createUser({ email, password, email_confirm: true })` and
capture `user.id`.

Either way you end up with one `auth.users` row and its UUID — that UUID is
`AUTH_USER_ID` below.

---

## 3. Run the provisioning script

```bash
AUTH_USER_ID=<the-supabase-uid> \
ADMIN_EMAIL=admin@arconique.com \
ADMIN_FULL_NAME="Arconique Management Admin" \
ORG_CODE=ARCONIQUE_MGMT \
ORG_NAME="Arconique Management" \
PRODUCTS=mgmt,dev \
npm run provision:org
```

- Use the **same email** in Supabase and `ADMIN_EMAIL` — that pair is what lets you log in.
- `PRODUCTS=mgmt` for a management-only tenant; `mgmt,dev` to also enable the Development OS.
- Add `DRY_RUN=1` to preview without writing.
- Re-running is safe (idempotent): the org insert is `ON CONFLICT DO NOTHING`, and `provision_app_user()` is idempotent on `auth_user_id`/`email`.

What it writes (and nothing else — no villas/owners/projects):

| Table | Row |
|---|---|
| `organizations` | one row, `organization_type='developer_client'` (a legal CHECK value) |
| `app_users` | linked via `auth_user_id`, `organization_id` = the new org |
| `user_roles` | global `super_admin` grant — the master access key (`hasPermission()` short-circuits `true`) |
| `app_user_roles` | `admin` cabinet row — UI routing only |

If you ran without `AUTH_USER_ID`, the script refuses and prints the exact
Supabase steps — it will not create an org with an unloginnable admin.

---

## 4. Verify (after you log in)

**4a. Login + admin access.** Sign in at `https://management.arconique.com`.
You should reach the dashboard. Confirm the grant:

```sql
SELECT u.email, u.organization_id, r.key AS role
FROM app_users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE u.email = 'admin@arconique.com';
-- expect: role = 'super_admin', organization_id = <ARCONIQUE_MGMT org id>
```

`super_admin` opens every action cell / settings / users / roles surface.

**4b. Org is empty — and check the one known leak (§5c).** Projects are
org-scoped and will be empty. ⚠️ **Villas and Owners reads are not yet
org-scoped** (tracked fix), so any **leftover `DEMO-` rows in prod will appear**
on the Villas/Owners pages. Before declaring the org clean:

```sql
SELECT count(*) FROM villas WHERE unit_code LIKE 'DEMO-%' OR slug LIKE 'DEMO-%';
SELECT count(*) FROM owners WHERE code   LIKE 'DEMO-%' OR slug LIKE 'DEMO-%';
```

If non-zero, wipe demo rows with `npm run seed:arconique-demo -- --wipe`, then
re-check the pages render empty. The permanent fix (org-scoping those queries)
is tracked separately — see the cross-tenant-read follow-up.

---

## 5. Notes & decisions

- **Admin email** (`admin@arconique.com` by default): use a real mailbox you
  control — it becomes `app_users.email` (UNIQUE) and the Supabase identity, and
  it's where password resets go. Changing it later means redoing §2.
- **`organization_code`** (`ARCONIQUE_MGMT`): not user-visible, not tied to the
  hostname. Any unique upper-snake string works; avoid `ARCONIQUE_DEFAULT` (the
  seed org).
- **Legal vs display name:** `ORG_NAME` is the legal `name` (shown in-app). Set
  `ORG_DISPLAY_NAME` if your brand name differs.
- **Products:** `mgmt,dev` (default) or `mgmt` only.
