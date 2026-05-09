# Stage 10.H — Per-product (Mgmt OS / Dev OS) split

**Audience:** engineers wiring new pages, modifying the auth surface, or
investigating why a route redirects unexpectedly.

**Status:** Shipped 2026-05-09 across 4 commits + 1 migration (`0091`).

---

## Concept

Arconique runs two product surfaces under one deployment:

| Product | URL prefix | Purpose |
|---|---|---|
| Management OS | `/dashboard/*` | Operate, report, distribute owner statements |
| Development OS | `/development-os/*` | Build, sell, and hand over villas — full-cycle |

Stage 10.H makes per-tenant access to each product **explicit**. Before
this stage, every signed-in user with internal-role privileges could
reach both products. After this stage, an org's `products_enabled
text[]` controls which surfaces its users can enter.

Default for every existing tenant: `'{mgmt,dev}'` — unchanged behaviour.

---

## Schema

`organizations.products_enabled text[] NOT NULL DEFAULT ARRAY['mgmt','dev']`

Migration: [`drizzle/0091_organizations_products_enabled.sql`](../drizzle/0091_organizations_products_enabled.sql).

- **GIN index** on the column (`organizations_products_enabled_idx`) for the
  per-request middleware containment lookup (`@> ARRAY['mgmt']`).
- Allowed values: `'mgmt'`, `'dev'`. NOT enforced via CHECK constraint —
  runtime `coerceProductSlugs()` filters unknowns. Add a CHECK if a
  third product ever lands and we want strict DB-level closure.

---

## Runtime enum

[`src/lib/products.ts`](../src/lib/products.ts) — pure module (no React,
no DB, no env). Single source of truth for:

- `PRODUCT_SLUGS = ["mgmt", "dev"] as const`
- `ProductSlug = "mgmt" | "dev"`
- `PRODUCT_LABELS` — display strings (`"Management OS"`, `"Development OS"`)
- `PRODUCT_HOME` — default landing URL per product
- `productForPath(pathname)` — URL prefix → `ProductSlug | null`
- `isValidProductSlug(value)` + `coerceProductSlugs(value)` — type guards
- `orgHasProductAccess(productsEnabled, product)` — membership predicate
- `pickLandingProduct(productsEnabled)` — sign-in landing picker (null when both)

Importable from server components, client components, edge middleware,
and tests.

---

## Auth surface

Two-file split mirroring `src/features/security-baseline/{login-throttle,login-throttle-pure}.ts`:

| File | Concern |
|---|---|
| [`src/features/auth/products-access-pure.ts`](../src/features/auth/products-access-pure.ts) | `decideProductAccess()` + `landingPathFor()` — pure, no I/O, testable from `node:test` |
| [`src/features/auth/products-access.ts`](../src/features/auth/products-access.ts) | `server-only` — `getProductsEnabledForCurrentUser()` (DB) + `enforceProductAccess()` (calls pure decision then `redirect()`). Re-exports the pure helpers. |

### `decideProductAccess()` — the matrix

| `isSuperAdmin` | `isDemoMode` | `productsEnabled` | Outcome |
|:---:|:---:|---|---|
| true | * | * | **allowed** |
| * | true | * | **allowed** |
| false | false | `null` | refused, reason: `no_organization` |
| false | false | `[]` | refused, reason: `no_products_enabled` |
| false | false | `["mgmt", "dev"]`, product = `mgmt` | **allowed** |
| false | false | `["mgmt"]`, product = `dev` | refused, reason: `product_not_enabled`, `alternativeProducts: ["mgmt"]` |

The `alternativeProducts` field drives the redirect target — guard
sends the user to their first-listed accessible product.

### `enforceProductAccess(slug)` — the layout guard

```ts
// src/app/(dashboard)/layout.tsx
export default async function DashboardLayout({ children }) {
  await enforceProductAccess("mgmt");  // ← redirects on miss
  return <DashboardShell>{children}</DashboardShell>;
}
```

```ts
// src/app/(development-app)/layout.tsx
await enforceProductAccess("dev");
```

Behaviour:
- Anonymous visitor → pass through (existing sign-in CTA surfaces handle it).
- super_admin / demo mode → pass through (audit-bot + dev workflows preserved).
- Org has the product → pass through.
- Org has a different product → `redirect()` to that product's `PRODUCT_HOME`.
- Org has zero products → `redirect("/no-product-access")`.

### Why layout-level, not edge middleware

Edge middleware can't easily query Postgres + can't render a friendly
inline message (only redirects). Server layouts run per request with
full DB access; `redirect()` from a layout short-circuits cleanly to
the destination. The existing `src/middleware.ts` (Stage 7.E tenant
subdomain resolver) stays in place for its own purpose — it stamps the
`x-tenant-slug` header — and runs before the layouts.

---

## Sign-in flow

[`src/features/auth/actions.ts → signInAction`](../src/features/auth/actions.ts):

```
supabase.auth.signInWithPassword(...)
  → getProductsEnabledForCurrentUser()
  → landingPathFor(productsEnabled)
  → redirect(landingPath)
```

`landingPathFor()` table:

| Input | Output |
|---|---|
| `null` (lookup failure) | `/dashboard` (soft fallback) |
| `[]` | `/no-product-access` |
| `["mgmt"]` | `/dashboard` |
| `["dev"]` | `/development-os` |
| `["mgmt", "dev"]` | `/dashboard` (default; future: last-used cookie) |

Lookup failures don't block sign-in — fall back to `/dashboard`, let
the layout guard sort out any subsequent redirect.

---

## Cross-product switcher

[`src/components/shared/workspace-switcher.tsx`](../src/components/shared/workspace-switcher.tsx)
gains an `enabledProducts?: ProductSlug[] | null` prop. Workspaces declare
`requiresProduct?: ProductSlug` — if set, they only render when the org
has that product. Owner Portal + Field App are NOT gated (separate
access surfaces, not products).

When `≤ 1` workspace is reachable, the switcher returns `null` (no
single-option dropdown noise).

The shells fetch `productsEnabled` server-side
([`dashboard-shell.tsx`](../src/components/layout/dashboard-shell.tsx),
[`development-app-shell.tsx`](../src/components/development/development-app-shell.tsx))
and thread the value through the topbars to the switcher.

---

## Brand split

The `<Logo>` component takes `subtitle` + `title` + `href` props. Each
sidebar passes its product-specific copy:

| Sidebar | `subtitle` | `title` | `href` |
|---|---|---|---|
| [`dashboard-sidebar.tsx`](../src/components/layout/dashboard-sidebar.tsx) | `"Management OS"` | `"Arconique Management OS"` | `/dashboard` |
| [`development-app-sidebar.tsx`](../src/components/development/development-app-sidebar.tsx) | `"Development OS"` | `"Arconique Development OS"` | `/development-os` |

Both topbars render `<Logo variant="mark" />` (icon-only) on mobile.
**Pages NEVER render `<Logo>` directly** — only the shells do. This
is locked in via test (Stage 10.H Part 5).

---

## /no-product-access landing

[`src/app/(public)/no-product-access/page.tsx`](../src/app/(public)/no-product-access/page.tsx):

Reached when a signed-in user's org has `products_enabled = '{}'`. Lives
in the `(public)` route group so the public layout (header + footer)
wraps it. Includes:
- Lock icon + "No product access" headline
- Friendly explanation (workspace owner needs to enable a product)
- Sign-out CTA (calls `signOutAction`)
- Return-to-landing button

Distinct from `/login` (anonymous user) and `/sign-up` (provision new
org) — the user IS signed in; they just have nothing to use.

---

## Cross-product links

The Stage 10.H Part 5 audit documented every inline cross-product link.
All are intentional:

| Direction | Count | Examples |
|---|---|---|
| Mgmt → Dev (4) | AI agent settings link to Dev-OS WhatsApp + memory layer + AI inbox |
| Dev → Mgmt (12) | Mostly link to `/dashboard/jobs` (the canonical job-execution surface, only in Mgmt OS); also `/dashboard/ai/runs` and `/dashboard/finance/statement-imports` |

Cross-links are **NOT prohibited** — the workspace switcher is the
canonical surface, but inline cross-links are fine when scoped to
context-specific operator workflows. The Part 5 audit confirmed zero
accidental leakage.

If you add a new cross-product link, prefer:
- Wrap in a `<Button asChild variant="secondary">` to signal "leaving this product"
- Don't open in new tab — the switcher already exists for parallel access
- Use the canonical `PRODUCT_HOME[other]` URL when the link is just "go to the other product"

---

## Adding a third product

The shape supports more product slugs without schema migration. To add `'cabinets'` (hypothetical):

1. **Update enum**: add `"cabinets"` to `PRODUCT_SLUGS` in `src/lib/products.ts`.
2. **Update labels + home**: add entries to `PRODUCT_LABELS` + `PRODUCT_HOME`.
3. **Update prefix map**: add `["/cabinets", "cabinets"]` to `PRODUCT_PREFIXES`.
4. **Wire layout guard**: add `await enforceProductAccess("cabinets")` to the new route group's layout.
5. **Wire brand**: pass `subtitle="Cabinets"` to the Cabinets sidebar Logo.
6. **Wire switcher**: add a workspace entry with `requiresProduct: "cabinets"`.
7. **Backfill orgs**: `UPDATE organizations SET products_enabled = products_enabled || ARRAY['cabinets']` (or per-tenant per billing).

The schema, the runtime enum, the layout guard, and the switcher all
extend symmetrically. No DB migration unless you want a CHECK
constraint to enforce closure (`CHECK (products_enabled <@ ARRAY['mgmt','dev','cabinets'])`).

---

## Subdomain routing (deferred)

Stage 10.H is path-based:

```
arconique.com/dashboard/*     → Mgmt OS
arconique.com/development-os/* → Dev OS
```

Subdomain routing (`mgmt.arconique.com` / `dev.arconique.com`) is **not**
introduced. If we ever switch:

- `productForPath()` becomes `productForRequest(req)` — single seam.
- Add a hostname check before the path check.
- Cookies need `domain=.arconique.com` for cross-subdomain sessions.
- DNS: wildcard `*.arconique.com` already exists for tenant subdomains
  (Stage 7.E); add explicit Mgmt + Dev subdomains as separate Vercel
  domain entries.

The decision was deferred per master plan — no operator pull for the
subdomain pattern yet.

---

## Test contract

[`tests/development-stage-10-h-part-4.test.ts`](../tests/development-stage-10-h-part-4.test.ts) — 26 tests:

- `src/lib/products.ts` pure helpers (5)
- `decideProductAccess()` matrix (6)
- `landingPathFor()` (4)
- Layout guard wiring (2)
- Brand split (2)
- Switcher gating (2)
- Shell + topbar threading (2)
- signInAction redirect (1)
- `/no-product-access` page (1)
- File split (1)

[`tests/development-stage-10-h-part-5.test.ts`](../tests/development-stage-10-h-part-5.test.ts) — Part 5 regression locks:
- Both layout files exist with the right guards
- Both sidebars have the right brand (subtitle + title + href triple)
- No page directly imports `<Logo>` from `@/components/brand/logo` (only shells do)
- No cross-product shell imports (`development-app-shell` in `(dashboard)/`, `dashboard-shell` in `(development-app)/`)

---

## Operational runbook

### Grant a product to an existing org

```sql
UPDATE organizations
   SET products_enabled = (
     SELECT array_agg(DISTINCT p)
       FROM unnest(products_enabled || ARRAY['dev']) p
   )
 WHERE id = '<org_id>';
```

(The DISTINCT keeps duplicates out if the org already had it.)

### Revoke a product from an org

```sql
UPDATE organizations
   SET products_enabled = array_remove(products_enabled, 'dev')
 WHERE id = '<org_id>';
```

After revoke, every signed-in user from that org will be redirected
away from the revoked product's surfaces on their next request.

### Reset to default

```sql
UPDATE organizations SET products_enabled = ARRAY['mgmt', 'dev']
 WHERE id = '<org_id>';
```

### Investigate "user can't access X"

1. Check the org's `products_enabled`:
   ```sql
   SELECT o.id, o.name, o.products_enabled
     FROM organizations o
     JOIN app_users u ON u.organization_id = o.id
    WHERE u.email = '<email>';
   ```
2. Check the user's roles — `super_admin` bypasses the guard:
   ```sql
   SELECT r.key
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     JOIN app_users u ON u.id = ur.user_id
    WHERE u.email = '<email>';
   ```
3. Check `mode` resolution — in demo mode every request bypasses.

---

## Out of scope (Stage 11+ candidates)

- Per-org product-default policy on new-org creation (currently always `{mgmt,dev}`)
- Last-used-product cookie for dual-product orgs
- "This product isn't enabled" flash message on the redirect
- Subdomain routing
- CHECK constraint on slug values
- Audit trail / history table for `products_enabled` changes
- Owner / Field as priced products
