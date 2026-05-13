/**
 * Stage 10.6 / Phase 10.6.E.1 — SubscriptionOS architecture phase.
 *
 * Layout + workspace switcher entry + landing page + architecture doc.
 * 0 migrations (per CHECKPOINT 5 default — schema already shipped Stage 7.D).
 *
 * What this sub-phase delivers:
 *   - (subscription-app) layout: super_admin-gated, mirrors 10.6.B.2-fix
 *     pattern (try/catch + isRedirectError + ServiceTemporarilyUnavailable
 *     fallback). Bypasses enforceProductAccess (platform-admin workspace).
 *   - WorkspaceSwitcher: 5th entry "subscription" with new requiresSuperAdmin
 *     filter. Default isSuperAdmin=false keeps platform-admin hidden.
 *   - /subscriptions landing page rendering planned-pages roadmap.
 *   - docs/subscription-os-architecture.md decision doc.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const LAYOUT = "src/app/(subscription-app)/layout.tsx";
const LANDING = "src/app/(subscription-app)/subscriptions/page.tsx";
const SWITCHER = "src/components/shared/workspace-switcher.tsx";
const DOC = "docs/subscription-os-architecture.md";

// ============================================================================
// Layout — super_admin gate + 10.6.B.2-fix resilience pattern
// ============================================================================

test("10.6.E.1.0 — (subscription-app) layout ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, LAYOUT)));
});

test("10.6.E.1.0 — layout uses isRedirectError + ServiceTemporarilyUnavailable (10.6.B.2-fix pattern)", () => {
  const src = read(LAYOUT);
  assert.match(
    src,
    /import \{ isRedirectError \} from "next\/dist\/client\/components\/redirect-error";/,
  );
  assert.match(src, /ServiceTemporarilyUnavailable/);
  assert.match(src, /if \(isRedirectError\(err\)\) throw err/);
});

test("10.6.E.1.0 — layout gates on isSuperAdmin (not enforceProductAccess)", () => {
  const src = read(LAYOUT);
  // Reads from getCurrentUserContext (which exposes isSuperAdmin)
  assert.match(
    src,
    /import \{ getCurrentUserContext \} from "@\/features\/auth\/permissions";/,
  );
  // Explicit super_admin check + redirect to /no-product-access on miss
  assert.match(
    src,
    /if \(!ctx\.isSuperAdmin\)[\s\S]{0,200}redirect\("\/no-product-access\?reason=subscription-os-requires-super-admin"\)/,
  );
  // Does NOT call enforceProductAccess (platform-admin workspace, not
  // product-gated). Comments mentioning the bypass are fine; the
  // function call (`await enforceProductAccess(...)`) must be absent.
  assert.doesNotMatch(src, /await enforceProductAccess\(/);
});

test("10.6.E.1.0 — layout has demo-mode bypass (matches Mgmt OS / Dev OS pattern)", () => {
  const src = read(LAYOUT);
  assert.match(src, /ctx\.mode === "demo"/);
});

test("10.6.E.1.0 — layout redirects unauthenticated users to /login?next=/subscriptions", () => {
  const src = read(LAYOUT);
  assert.match(src, /redirect\("\/login\?next=\/subscriptions"\)/);
});

// ============================================================================
// Workspace switcher — 5th entry + super_admin filter
// ============================================================================

test("10.6.E.1.1 — switcher adds 'subscription' workspace key", () => {
  const src = read(SWITCHER);
  assert.match(
    src,
    /export type WorkspaceKey =[\s\S]{0,200}\| "subscription"/,
  );
  assert.match(src, /key: "subscription"/);
  assert.match(src, /name: "SubscriptionOS"/);
  assert.match(src, /href: "\/subscriptions"/);
});

test("10.6.E.1.1 — switcher introduces requiresSuperAdmin filter on Workspace interface", () => {
  const src = read(SWITCHER);
  assert.match(src, /requiresSuperAdmin\?: boolean/);
});

test("10.6.E.1.1 — switcher accepts isSuperAdmin prop (defaults to false)", () => {
  const src = read(SWITCHER);
  assert.match(src, /isSuperAdmin\?: boolean/);
  assert.match(src, /isSuperAdmin = false/);
});

test("10.6.E.1.1 — visibleWorkspaces() filters by both enabledProducts AND isSuperAdmin", () => {
  const src = read(SWITCHER);
  assert.match(
    src,
    /visibleWorkspaces\([\s\S]{0,300}isSuperAdmin: boolean[\s\S]{0,400}requiresSuperAdmin && !isSuperAdmin/,
  );
});

test("10.6.E.1.1 — switcher adds 'ink' tone (bg-ink text-ink-inverse) for SubscriptionOS", () => {
  const src = read(SWITCHER);
  assert.match(src, /ink: "bg-ink text-ink-inverse"/);
});

// ============================================================================
// Landing page
// ============================================================================

test("10.6.E.1.2 — /subscriptions landing page ships", () => {
  assert.ok(existsSync(resolve(ROOT, LANDING)));
});

test("10.6.E.1.2 — landing page renders CabinetGreetingBlock + PageHeaderHero (10.6.C tokens)", () => {
  const src = read(LANDING);
  assert.match(src, /<CabinetGreetingBlock\b/);
  assert.match(src, /<PageHeaderHero\b/);
});

test("10.6.E.1.2 — landing page surfaces planned 6 admin pages", () => {
  const src = read(LANDING);
  for (const name of [
    "Customer organizations",
    "Revenue dashboard",
    "Usage analytics",
    "Customer support tools",
    "Platform-admin audit log",
    "Stripe billing collection",
  ]) {
    assert.match(
      src,
      new RegExp(`name:\\s*"${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"`),
      `missing planned page: ${name}`,
    );
  }
});

test("10.6.E.1.2 — landing 'foundation in place' callout uses gradient-emerald-soft", () => {
  const src = read(LANDING);
  assert.match(
    src,
    /rounded-3xl border border-line-soft bg-gradient-emerald-soft shadow-soft-card/,
  );
});

// ============================================================================
// Architecture doc
// ============================================================================

test("10.6.E.1.3 — architecture decisions doc shipped", () => {
  assert.ok(existsSync(resolve(ROOT, DOC)));
  const src = read(DOC);
  assert.match(src, /^# SubscriptionOS — Architecture/m);
});

test("10.6.E.1.3 — doc locks URL prefix /subscriptions + permission model + schema impact", () => {
  const src = read(DOC);
  assert.match(src, /URL structure/);
  assert.match(src, /Locked.*\/subscriptions/);
  assert.match(src, /Permission model/);
  assert.match(src, /Schema impact/);
  assert.match(src, /0 migrations/);
});

test("10.6.E.1.3 — doc references the 10.6.B.2-fix layout-resilience pattern", () => {
  const src = read(DOC);
  assert.match(src, /10\.6\.B\.2-fix/);
  assert.match(src, /isRedirectError/);
});
