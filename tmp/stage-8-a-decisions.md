# Stage 8 / Phase 8.A — Production Hygiene — Decisions

**Date**: 2026-05-08
**Hours target**: 1 day | Tests target: ~15 | Migrations: 0
**Tests delivered**: 12 | Tests baseline 4845 → 4857

---

## 8.A.1 — `/dashboard/system/health` 39-way fan-out — DELIVERED

**Root cause** (per Stage 7.G deep-dive): page issued one `SELECT COUNT(*)` per tracked table via `Promise.all`, saturating the postgres pool on Vercel cold-start. Page hung >60s.

**Fix shipped**: replaced with a single `SELECT relname, n_live_tup FROM pg_stat_user_tables` round-trip in a new helper `getApproximateRowCounts()` (in `src/features/system/db-health.ts`). The helper:
- Runs one DB query, no fan-out.
- Maps every tracked table to `{ ok: true, value }` if present in the catalog or `{ ok: false, kind: "missing_relation" }` if not — preserving the page's existing "Migration pending" badge UX.
- Falls through to `kind: "unknown"` for the entire batch on whole-query failure (clear "DB unhealthy" signal instead of a hang).

**Trade-off**: `n_live_tup` is approximate (last-`ANALYZE` count). Acceptable for a health dashboard that asks "is this populated?" — exact counts are not required.

**Tests**: 2.

## 8.A.2 — `/legal/terms` + `/legal/privacy` — DELIVERED

Two new placeholder pages under `src/app/(public)/legal/`. Static (`○` in build output), reachable from the `/sign-up` prefetch links. Eliminates the two console 404s flagged by the audit.

**Trade-off**: copy is placeholder, not finalized legal text. Pages link to `legal@arconique.com` and `privacy@arconique.com` for substantive questions. Final text drops in alongside customer launch.

**Tests**: 2.

## 8.A.3 — Cabinet gating rollout — DELIVERED

**Stage 7.F.D.3 helper** (`gateCabinet`) was already shipped but not wired to any cabinet page. Phase 8.A wraps all 8 paid cabinets:
- site-supervisor, project-manager, cfo-accountant, qs, procurement-manager, warehouse-manager, marketing-staff, sales-manager

**Helper extension**: added `gateCabinetForCurrentOrg(slug)` to `src/lib/billing/cabinet-gating.ts`. Resolves the org via the `ARCONIQUE_DEFAULT` fallback used by other dev-os pages (`settings/data-export`, `settings/api-keys`, etc.) until Stage 7.E tenant subdomain resolution is wired through. Returns `null` (= bypass gating) if the org is unreachable so pages keep rendering — gating is a billing UX surface, not a security boundary; server-action RBAC is unchanged.

**Page injection**: 7-line preamble per cabinet, applied via `/tmp/apply-cabinet-gating.mjs` for consistency:
```ts
const __gateRedirect = await gateCabinetForCurrentOrg("qs");
if (__gateRedirect) redirect(__gateRedirect);
```

`my-cabinet` is intentionally NOT gated — it's the operator's own landing page (resolves via landing-resolver to whichever role-cabinet they should see).

**Tests**: 2.

## 8.A.4 — `/my-cabinet` identity wire — VERIFIED NO-OP

Already shipped. `src/app/(development-app)/development-os/cabinets/my-cabinet/page.tsx` calls `getCurrentAppUser()` and `resolveLandingPageForUserId()`, redirects to the role-appropriate cabinet, falls back to `/development-os/dashboard` if no user. Stage 7.G's "empty state" finding was a false positive — the page is a redirect-only shell.

**Tests**: 1 (regression guard against future identity-wiring removal).

## 8.A.5 — Wi-Fi migrate sweep button — DELIVERED (defensive)

**Root cause investigation**: with audit-bot login, the page renders 200. The user-reported 500 surfaces only when the *button* is clicked AND `STAY_LINK_KMS_SECRET` is missing on Vercel. Code path: button → `runWifiMigrationAction` → `migratePlaintextWifiPasswords` → `ensureActiveKeyVersion` → `resolveSecret` → throws `"Wi-Fi encryption refused: STAY_LINK_KMS_SECRET is not configured in production."` because `isProduction() === true`.

**Fix shipped (defensive)**: `WifiMigrateButton` now accepts a `kmsReady` prop and disables itself when false. The migrate page already computed `isStayLinkKmsConfigured()` and renders a warning banner — now it also passes that bool to the button. Operators see the banner + a disabled button instead of a clickable button that 500s.

**What's NOT done in this session**: setting `STAY_LINK_KMS_SECRET` on Vercel. That's a manual operator step (Vercel CLI auth not available from this session). Once the env is set, the button auto-enables.

**Tests**: 2.

## 8.A.6 — `/development-os/boq/new` — DELIVERED (defensive)

**Root cause investigation**: with audit-bot, the page itself returns 200. The 500 surfaces on form submit when the projects table is empty: the form's `projectId` defaults to `""` (no options to pick), and `createBoqDocument`'s Zod schema rejects with a 400 that the form's catch surfaces as 500.

**Fix shipped (defensive)**: when `projectRows.length === 0`, the page short-circuits to an `EmptyState` with a "Create a project" CTA pointing at `/development-os/projects`. Operator gets a clear next step instead of a broken form.

**Tests**: 1.

## 8.A.7 — Service worker clone bug + PWA icon 404s — DELIVERED

**SW bug**: `staleWhileRevalidate` called `response.clone()` *inside* an async `caches.open(...).then(...)` callback. By the time the callback ran, the body was already locked by the caller's consumption of the returned response, throwing `Failed to clone Response: body is locked`. Classic SW bug.

**Fix**: clone synchronously before the async chain.
```js
// before
caches.open(cacheName).then((c) => c.put(request, response.clone())); // FAIL — body locked
// after
const clone = response.clone();                                       // sync, body still readable
caches.open(cacheName).then((c) => c.put(request, clone));
```

**PWA icons**: `public/icons/` directory was missing entirely; manifest referenced 8 icons. Generated all 8 sizes (72, 96, 128, 144, 152, 192, 384, 512) via `scripts/generate-pwa-icons.ts` using `sharp` to render a solid-black square with a centered white "A" SVG. Placeholder until brand assets land — kills the 404s and makes the PWA installable.

**Tests**: 2.

---

## Phase 8.A acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 8.A items | 7 | 7 |
| Tests delivered | ~15 | 12 |
| Test count | 4845 → 4860 | 4857 (+12) |
| Build | clean | ✅ |
| `check:cron` | 0 fatal, 0 warning | ✅ (101 routes / 100 jobs) |
| New migrations | 0 | ✅ |

**Remaining manual operator step**:
- Set `STAY_LINK_KMS_SECRET` on Vercel (32+ char secret). Without it, the wifi-migrate button stays disabled and `wifi-crypto` refuses to encrypt in prod. Confirm the env var is present via Vercel dashboard or `vercel env ls`.

**STAGE 8 / PHASE 8.A ACCEPTED.**
