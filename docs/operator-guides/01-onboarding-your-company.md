# Onboarding your own company

How to spin up your Arconique tenant the same way a paying customer
would. This is the dogfood path — once you've walked it, you'll know
exactly what your customers see.

## What you're creating

A new **organization** (your villa-management company) + a **first
admin user** (you) + a **14-day trial subscription**. Everything you
do in the new tenant is isolated from any other tenant; cabinets,
finance, villas, AI agent settings are all scoped per-org.

## Steps

### 1. Visit the public signup page

```
https://<your-arconique-domain>/signup
```

Optional query: `?product=mgmt` (Management OS), `?product=dev`
(Development OS), or leave off for "both" (default).

### 2. Fill the form

| Field | Notes |
|---|---|
| Email | Your business email. This becomes your login. |
| Password | At least 8 chars. You can also leave blank and follow a magic-link from your inbox. |
| Full name | Used in your profile + audit log. |
| Workspace name | The display name of your org. e.g. "Arconique". |
| Workspace slug | URL-safe code (`a-z0-9-`). e.g. `arconique`. Must be unique across the platform. The slug becomes your `organization_code`. |
| Plan | `trial` by default. You can upgrade later via `/dashboard/billing/upgrade`. |

### 3. Submit

The flow runs atomically:

1. Validates your slug isn't taken.
2. Creates your Supabase Auth user.
3. Creates the `organizations` row.
4. Grants you `super_admin` (internal) + `admin` (cabinet) roles.
5. Starts a 14-day trial subscription.
6. Audit-logs the org creation.

On any failure during 3–6, the Auth user is deleted so you can retry
without an orphan account.

### 4. Sign in

You'll be redirected to `/login?onboarded=1&email=<you>`. Enter your
password (or click the magic-link button) → land at `/dashboard`.

## What you'll see at `/dashboard` for the first time

A **bare cabinet**. No villas, no bookings, no transactions, no
guests. That's expected — your tenant starts empty. Your first daily
tasks:

1. `/dashboard/villas` → Add your first villa.
2. `/dashboard/integrations` → Connect Airbnb / Booking.com / etc.
3. `/dashboard/settings/team` → Invite your property manager
   (see [02-inviting-your-team.md](./02-inviting-your-team.md)).
4. `/development-os/finance/categories` → Add your first cost category.
5. `/development-os/finance/bank-accounts` → Add your first operating account.

## Known limits today

- **No automated welcome email** post-signup. You won't get a confirmation
  email; the signup page redirects directly to `/login`. Bookmark the URL.
- **No onboarding wizard** — the first dashboard view is the empty
  daily-use cabinet, not a "let's set up your villas" wizard. You
  navigate by yourself.
- **No sample data**. The tenant starts empty. If you want a
  populated cabinet for screenshots, manually add a "Sample" villa /
  category / booking.
- **One org per email**. If you already have an account in another
  tenant, you can't re-signup with the same email — use a different
  one or contact support.

## Migrating off the seed `ARCONIQUE_DEFAULT` tenant

Before STAB-4, all your data lived under the seed `ARCONIQUE_DEFAULT`
org. To migrate to a real per-customer tenant:

1. Run `/signup` once with your real business email and workspace name.
2. A new org is created — let's call it `ORG_ARCONIQUE`.
3. **Manually move data** from `ARCONIQUE_DEFAULT` → `ORG_ARCONIQUE`:
   - This requires a one-off SQL script run by a DBA, since the data
     model doesn't (yet) have a "transfer ownership" tool. Pattern is
     `UPDATE devXxx SET organization_id = '<new>' WHERE organization_id = '<seed>'`
     for every multi-tenant table from migration 0072.
4. Reseed any onboarding fixtures (asset_types, lead_sources, etc.)
   into the new org if needed.

Out of STAB-4's scope — flag for the next ops sprint.
