# Local development setup

This doc covers the **subdomain-based dev model** introduced in Sprint
2 (see `src/middleware.ts`). For everything else — Supabase, database,
Stripe keys — see `.env.example` and `docs/ENVIRONMENT-VARIABLES.md`.

---

## Why four hostnames?

Production splits the platform across four product subdomains so each
product surface has its own login, its own apex landing, and its own
allow-listed path tree:

| Production host                     | What lives there                  |
| ----------------------------------- | --------------------------------- |
| `management.arconique.com`          | Management OS (route group `(dashboard)/*`, plus `(owner)`, `(field)`, `(guest)`) |
| `development.arconique.com`         | Development OS (`(development-app)/*`, plus `(investor-portal)`, `(buyer-portal)`, `(vendor)`) |
| `subscription.arconique.com`        | Public sales surface (`/pricing`, `/signup`, marketing pages). Content lands in Sprint 3. |
| `platform.arconique.com`            | Platform Admin OS (`(platform-app)/platform/*`, super_admin-gated) |
| `arconique.com` (apex)              | Served by the separate `capital/` Vercel project (institutional-investor site). |
| `<tenant>.arconique.com`            | Per-tenant routing (Stage 7.E, preserved). Header `x-tenant-slug` is stamped. |

The middleware (`src/middleware.ts`) decides which surface to serve
based on the request host, stamps an `x-product` (or `x-tenant-slug`)
header, and 307-redirects to `/` when the pathname doesn't match the
product's allowedPrefixes table.

## Hostnames to use locally

Most browsers resolve `*.localhost` to `127.0.0.1` natively (Chrome,
Safari, Firefox all do this). If yours does not, add the following to
`/etc/hosts`:

```
127.0.0.1 management.localhost
127.0.0.1 development.localhost
127.0.0.1 subscription.localhost
127.0.0.1 platform.localhost
```

Then `npm run dev` and open whichever surface you're working on:

```
http://management.localhost:3000      # Mgmt OS apex
http://management.localhost:3000/dashboard
http://development.localhost:3000     # Dev OS apex
http://development.localhost:3000/development-os
http://subscription.localhost:3000    # public sales (Sprint 3)
http://platform.localhost:3000        # Platform Admin OS (super_admin only)
http://platform.localhost:3000/platform
```

Per-tenant subdomain routing still works for arbitrary slugs:

```
http://acme.localhost:3000/dashboard
```

…which renders Mgmt OS with `x-tenant-slug: acme` available to server
components.

## What happens on disallowed paths

Each product subdomain has an allow-list of top-level path prefixes
(see `PRODUCT_SUBDOMAINS` in `src/middleware.ts`). Anything outside
that list 307-redirects to `/`. Some examples:

| Request                                              | Result |
| ---------------------------------------------------- | ------ |
| `management.localhost:3000/dashboard`                | renders Mgmt OS |
| `management.localhost:3000/development-os`           | 307 → `management.localhost:3000/` |
| `development.localhost:3000/development-os`          | renders Dev OS |
| `development.localhost:3000/dashboard`               | 307 → `development.localhost:3000/` |
| `platform.localhost:3000/platform/organizations`     | renders (after super_admin auth) |
| `platform.localhost:3000/dashboard`                  | 307 → `platform.localhost:3000/` |
| `subscription.localhost:3000/pricing`                | renders (Sprint 3 fills with real sales content) |
| `acme.localhost:3000/dashboard`                      | renders Mgmt OS with tenant header |

`/api/*` is exempt from the allow-list on every subdomain — the data
plane is reachable from anywhere the app runs.

## Smoke testing the middleware

```bash
# Mgmt OS dashboard renders
curl -sI -H "Host: management.localhost" http://localhost:3000/dashboard

# Mgmt OS rejects /development-os and redirects to /
curl -sI -H "Host: management.localhost" http://localhost:3000/development-os

# Dev OS allows /development-os
curl -sI -H "Host: development.localhost" http://localhost:3000/development-os

# Platform redirects /dashboard to /
curl -sI -H "Host: platform.localhost" http://localhost:3000/dashboard

# Per-tenant slug still works
curl -sI -H "Host: acme.localhost" http://localhost:3000/dashboard
```

Look for `307` status on redirect rows and the `x-product` (or
`x-tenant-slug`) header on the pass-through rows.

## Why `admin.arconique.com` no longer redirects

Sprint 2 removed `admin` from the reserved-subdomains set. The
platform-admin role moved to `platform.arconique.com`. Result: a tenant
named "admin" would now resolve as a regular per-tenant slug
(`x-tenant-slug: admin`), same as any other.

## Related references

- `src/middleware.ts` — routing table + pure helpers
- `src/components/product-landing/product-landing.tsx` — per-product apex
- `src/app/(public)/page.tsx` — header-driven short-circuit
- `src/app/(auth)/login/page.tsx` + `form.tsx` — product-aware login
- `src/features/auth/actions.ts` — `PRODUCT_LANDING` post-login table
- `tests/sprint-2-product-subdomain-routing.test.ts` — routing acceptance
- `tests/sprint-2-product-landing-and-login.test.ts` — landing/login acceptance
