/**
 * Prompt 116B — Owner Portal Demo Data Visibility + Visual Calendar +
 * Guest Stay Home Layout Fix tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf-8");
}

// -----------------------------------------------------------------------------
// 1) Owner-portal demo fallback
// -----------------------------------------------------------------------------

test("owner-portal-fallback module exposes the four demo data helpers", async () => {
  const mod = await import(
    "../src/features/demo-data/owner-portal-fallback"
  );
  assert.equal(typeof mod.listDemoOwnerBookings, "function");
  assert.equal(typeof mod.listDemoOwnerRevenueMonthly, "function");
  assert.equal(typeof mod.listDemoOwnerStayRequests, "function");
  assert.equal(typeof mod.listDemoOwnerInboxNotifications, "function");
  assert.equal(typeof mod.isDemoOwnerFallbackActive, "function");
});

test("listDemoOwnerBookings yields ≥8 rows with the required source mix", async () => {
  const mod = await import(
    "../src/features/demo-data/owner-portal-fallback"
  );
  const rows = mod.listDemoOwnerBookings();
  assert.ok(rows.length >= 8, `expected ≥8 owner bookings, got ${rows.length}`);

  const sources = new Set(rows.map((r) => r.sourceType));
  for (const s of [
    "direct_booking",
    "ota_airbnb",
    "ota_booking_com",
    "owner_stay",
    "maintenance_block",
    "internal_hold",
  ]) {
    assert.ok(sources.has(s as never), `missing source ${s}`);
  }
});

test("listDemoOwnerRevenueMonthly yields ≥6 rows with non-zero gross", async () => {
  const mod = await import(
    "../src/features/demo-data/owner-portal-fallback"
  );
  const rows = mod.listDemoOwnerRevenueMonthly();
  assert.ok(rows.length >= 6, `expected ≥6 monthly rows, got ${rows.length}`);
  const totalGross = rows.reduce(
    (sum, r) => sum + r.grossRevenueMinor,
    0n,
  );
  assert.ok(totalGross > 0n, "total gross must be non-zero in demo");
});

test("listDemoOwnerStayRequests has ≥4 rows across the documented statuses", async () => {
  const mod = await import(
    "../src/features/demo-data/owner-portal-fallback"
  );
  const rows = mod.listDemoOwnerStayRequests();
  assert.ok(rows.length >= 4);
  const statuses = new Set(rows.map((r) => r.status));
  for (const s of ["requested", "pending_admin_review", "approved", "charges_posted"]) {
    assert.ok(statuses.has(s as never), `missing stay status ${s}`);
  }
});

test("listDemoOwnerInboxNotifications has ≥6 rows with mixed unread/read", async () => {
  const mod = await import(
    "../src/features/demo-data/owner-portal-fallback"
  );
  const rows = mod.listDemoOwnerInboxNotifications();
  assert.ok(rows.length >= 6);
  const unread = rows.filter((r) => r.status === "unread").length;
  const read = rows.filter((r) => r.status === "read").length;
  assert.ok(unread > 0 && read > 0, "expected mixed unread/read");
});

test("isDemoOwnerFallbackActive only fires in demo + non-production", async () => {
  const mod = await import(
    "../src/features/demo-data/owner-portal-fallback"
  );
  assert.equal(
    mod.isDemoOwnerFallbackActive({
      NEXT_PUBLIC_ENABLE_DEMO_MODE: "1",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    mod.isDemoOwnerFallbackActive({
      ARCONIQUE_FORCE_MOCK: "1",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    mod.isDemoOwnerFallbackActive({
      NEXT_PUBLIC_ENABLE_DEMO_MODE: "1",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv),
    false,
  );
  assert.equal(
    mod.isDemoOwnerFallbackActive({
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv),
    false,
  );
});

test("owner-bookings services wires the demo fallback", () => {
  const body = read("src/features/owner-bookings/services.ts");
  assert.match(body, /demoOwnerBookingFallback/);
  assert.match(body, /demoRevenueFallback/);
  assert.match(body, /isDemoOwnerFallbackActive/);
});

test("notifications services wires the demo inbox fallback", () => {
  const body = read("src/features/notifications/services.ts");
  assert.match(body, /demoOwnerInboxFallback|owner-portal-fallback/);
});

test("owner-stays service wires the demo fallback", () => {
  const body = read("src/features/owner-stays/services.ts");
  assert.match(body, /demoOwnerStayFallback|owner-portal-fallback/);
});

// -----------------------------------------------------------------------------
// 2) Owner portal pages
// -----------------------------------------------------------------------------

test("/owner/bookings default filter is 'all sources' and 'all statuses'", () => {
  const body = read("src/app/(owner)/owner/bookings/page.tsx");
  assert.match(body, /sp\.source \?\? "all"/);
  assert.match(body, /sp\.status \?\? "all"/);
});

test("/owner/bookings supports the documented source filters", () => {
  const body = read("src/app/(owner)/owner/bookings/page.tsx");
  for (const s of [
    "direct_booking",
    "ota_airbnb",
    "ota_booking_com",
    "ota_vrbo",
    "owner_stay",
    "maintenance_block",
  ]) {
    assert.match(body, new RegExp(s));
  }
});

test("/owner/calendar imports OwnerCalendarGrid", () => {
  const body = read("src/app/(owner)/owner/calendar/page.tsx");
  assert.match(body, /OwnerCalendarGrid/);
  assert.match(body, /visualEvents/);
});

test("/owner/villas/[id]/calendar imports OwnerCalendarGrid", () => {
  const body = read("src/app/(owner)/owner/villas/[id]/calendar/page.tsx");
  assert.match(body, /OwnerCalendarGrid/);
  assert.match(body, /visualEvents/);
});

// -----------------------------------------------------------------------------
// 3) OwnerCalendarGrid component
// -----------------------------------------------------------------------------

test("OwnerCalendarGrid component exists", () => {
  assert.ok(
    existsSync(join(repoRoot, "src/components/owner/owner-calendar-grid.tsx")),
  );
});

test("OwnerCalendarGrid renders weekday labels + ≥5 event kinds", () => {
  const body = read("src/components/owner/owner-calendar-grid.tsx");
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    assert.match(body, new RegExp(day));
  }
  for (const kind of [
    "direct_booking",
    "ota",
    "owner_stay",
    "maintenance",
    "internal_hold",
    "pending_direct_booking",
  ]) {
    assert.match(body, new RegExp(kind));
  }
});

test("OwnerCalendarGrid never references banned PII / token / provider fields", () => {
  const body = read("src/components/owner/owner-calendar-grid.tsx");
  for (const banned of [
    /guestEmail/i,
    /guest_email/i,
    /guestPhone/i,
    /guest_phone/i,
    /providerSessionId/i,
    /provider_session_id/i,
    /tokenHash/i,
    /token_hash/i,
    /lockCode|lock_code/i,
  ]) {
    assert.ok(!banned.test(body), `banned token ${banned} present`);
  }
});

test("OwnerCalendarGrid takes pre-projected events (no DB import)", () => {
  const body = read("src/components/owner/owner-calendar-grid.tsx");
  assert.ok(!/getDb|drizzle-orm|server-only/.test(body));
});

// -----------------------------------------------------------------------------
// 4) /stay/demo layout fix
// -----------------------------------------------------------------------------

test("/stay/demo home includes primary cards for the documented sections", () => {
  const body = read("src/app/(guest)/stay/demo/page.tsx");
  // Each primary section should reference its label or destination route.
  for (const section of [
    /\/stay\/demo\/check-in/,
    /\/stay\/demo\/wifi/,
    /\/stay\/demo\/services/,
    /\/stay\/demo\/concierge/,
    /\/stay\/demo\/emergency/,
    /\/stay\/demo\/neighborhood/,
    /\/stay\/demo\/house-rules/,
  ]) {
    assert.match(body, section, `missing primary section ${section}`);
  }
});

test("/stay/demo home links to top services directly", () => {
  const body = read("src/app/(guest)/stay/demo/page.tsx");
  // The home renders services via `/stay/demo/services/${s.id}`, where
  // `s.id` is each entry in TOP_SERVICES.  Verify the IDs are listed.
  assert.match(body, /\/stay\/demo\/services\/\$\{s\.id\}/);
  for (const sid of ["airport-transfer", "private-chef", "breakfast"]) {
    assert.ok(body.includes(sid), `TOP_SERVICES should include ${sid}`);
  }
});

test("/stay/demo home includes secondary nav for guide / requests / offline", () => {
  const body = read("src/app/(guest)/stay/demo/page.tsx");
  assert.match(body, /\/stay\/demo\/guide/);
  assert.match(body, /\/stay\/demo\/requests/);
  assert.match(body, /\/stay\/demo\/offline/);
});

test("/stay/demo home is marked demo-only", () => {
  const body = read("src/app/(guest)/stay/demo/page.tsx");
  assert.match(body, /Demo only/i);
});

// -----------------------------------------------------------------------------
// 5) Docs
// -----------------------------------------------------------------------------

test("DEMO_COMPLETENESS_MATRIX includes the P116B owner-portal expectations", () => {
  const body = read("docs/DEMO_COMPLETENESS_MATRIX.md");
  assert.match(body, /Owner portal demo expected counts/i);
  assert.match(body, /listDemoOwnerBookings/);
  assert.match(body, /listDemoOwnerRevenueMonthly/);
  assert.match(body, /listDemoOwnerStayRequests/);
  assert.match(body, /listDemoOwnerInboxNotifications/);
});

test("DEMO_COMPLETENESS_MATRIX includes the visual calendar checklist", () => {
  const body = read("docs/DEMO_COMPLETENESS_MATRIX.md");
  assert.match(body, /Visual calendar checklist/i);
  assert.match(body, /OwnerCalendarGrid/);
});

test("QA-DEMO-WALKTHROUGH calls out P116B fallback expectations", () => {
  const body = read("docs/QA-DEMO-WALKTHROUGH.md");
  assert.match(body, /P116B/);
  assert.match(body, /at least \*\*8\*\* rows/);
});

// -----------------------------------------------------------------------------
// 6) No business feature creep
// -----------------------------------------------------------------------------

test("no Stripe/Xendit/WhatsApp/smart-lock SDK introduced in P116B", () => {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  for (const banned of [
    "stripe",
    "@stripe/stripe-js",
    "xendit-node",
    "midtrans-client",
    "@aqara/sdk",
    "ttlock-node",
    "@whatsapp/business",
    "telegraf",
  ]) {
    assert.ok(!(banned in all), `package "${banned}" must not be added`);
  }
});

test("owner-portal-fallback contains no real-looking PII", () => {
  const body = read("src/features/demo-data/owner-portal-fallback.ts");
  // No bare phone numbers or real-looking emails.
  const phoneMatch = body.match(/\+\d{1,3}\s?\d{3}\s?\d{3,}/g) ?? [];
  for (const p of phoneMatch) {
    assert.ok(p.includes("•••") || p.includes("xxx"), `unexpected phone ${p}`);
  }
  const emailMatch = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
  for (const e of emailMatch) {
    assert.ok(
      e.endsWith("@example.test") || e.includes(".demo"),
      `real-looking email in owner-portal-fallback: ${e}`,
    );
  }
});

test("OwnerCalendarGrid + owner-portal-fallback are pure (no server-only / DB)", () => {
  for (const f of [
    "src/components/owner/owner-calendar-grid.tsx",
    "src/features/demo-data/owner-portal-fallback.ts",
  ]) {
    const body = read(f);
    // No actual `import "server-only"` directive.
    assert.ok(
      !/import\s+["']server-only["']/.test(body),
      `${f} must not import server-only`,
    );
    assert.ok(!/getDb|drizzle-orm/.test(body), `${f} must not access DB`);
  }
});
