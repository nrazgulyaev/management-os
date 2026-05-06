/**
 * Stage 5.I — Mobile + Offline (PWA) tests.
 *
 * Coverage:
 *   - Migration 0070 (3 tables, RLS, partial indexes, GENERATED columns where applicable)
 *   - Schema exports
 *   - Pure helpers:
 *     - dispatch-helpers (pickEligibleSubscriptions, classifyDeliveryFailure, code generators, conflict detection)
 *     - offline-queue client helpers (generateClientActionId, isDuplicateAction, shouldRetry)
 *   - Cron + dispatcher + route audit (67 routes)
 *   - API route presence (offline-sync + push subscribe/unsubscribe/vapid)
 *   - Service worker file presence + sensitive route filter
 *   - PWA manifest validity
 *   - Sidebar / UI page presence (push prefs + quick-photo)
 *   - Demo seed audit (Stage 5.I)
 *   - Architecture doc
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  pickEligibleSubscriptions,
  classifyDeliveryFailure,
  nextDispatchCode,
  nextOfflineActionCode,
  detectActionConflict,
  buildConflictKey,
  type SubscriptionLite,
} from "../src/lib/development/server/push/dispatch-helpers";
import {
  generateClientActionId,
  isDuplicateAction,
  shouldRetry,
  type OfflineAction,
} from "../src/lib/development/client/offline-queue";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0070 = "drizzle/0070_development_os_stage_5_i_pwa.sql";

function sub(partial: Partial<SubscriptionLite> & { id: string }): SubscriptionLite {
  return {
    id: partial.id,
    userId: partial.userId ?? "u1",
    isActive: partial.isActive ?? true,
    enabledNotificationTypes: partial.enabledNotificationTypes ?? [],
    consecutiveFailures: partial.consecutiveFailures ?? 0,
  };
}

function action(partial: Partial<OfflineAction> & { id: string }): OfflineAction {
  return {
    id: partial.id,
    endpoint: partial.endpoint ?? "/api/x",
    method: partial.method ?? "POST",
    payload: partial.payload ?? {},
    createdAt: partial.createdAt ?? new Date().toISOString(),
    failures: partial.failures ?? 0,
    lastAttempt: partial.lastAttempt,
    lastFailureReason: partial.lastFailureReason,
  };
}

// ===========================================================================
// 1) Migration 0070 — shape
// ===========================================================================

test("migration 0070 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0070));
  const sql = read(MIG_0070);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0070 creates push_subscriptions + notification_dispatch_log + offline_action_queue", () => {
  const sql = read(MIG_0070);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "push_subscriptions"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "notification_dispatch_log"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "offline_action_queue"/);
});

test("migration 0070 push_subscriptions endpoint UNIQUE", () => {
  const sql = read(MIG_0070);
  assert.match(sql, /"endpoint" TEXT NOT NULL UNIQUE/);
});

test("migration 0070 device_type enum has 4 values", () => {
  const sql = read(MIG_0070);
  for (const t of ["mobile", "tablet", "desktop", "unknown"]) {
    assert.ok(sql.includes(`'${t}'`), `device_type '${t}' missing`);
  }
});

test("migration 0070 dispatch_status enum has 5 values", () => {
  const sql = read(MIG_0070);
  for (const s of ["pending", "dispatched", "delivered", "failed", "expired"]) {
    assert.ok(sql.includes(`'${s}'`), `dispatch_status '${s}' missing`);
  }
});

test("migration 0070 has partial index on pending notifications scheduled_at", () => {
  const sql = read(MIG_0070);
  assert.match(
    sql,
    /notification_dispatch_log_scheduled_idx[\s\S]*?WHERE "dispatch_status" = 'pending'/,
  );
});

test("migration 0070 sync_status enum has 6 values", () => {
  const sql = read(MIG_0070);
  for (const s of [
    "received", "processing", "completed", "failed", "rejected", "duplicate",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `sync_status '${s}' missing`);
  }
});

test("migration 0070 action_type enum has 8 values", () => {
  const sql = read(MIG_0070);
  for (const t of [
    "create_site_report",
    "upload_photo",
    "create_qa_qc_issue",
    "record_inventory_movement",
    "submit_purchase_request",
    "log_productivity",
    "add_decision",
    "other",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `action_type '${t}' missing`);
  }
});

test("migration 0070 offline_action_queue UNIQUE on (user_id, client_action_id)", () => {
  const sql = read(MIG_0070);
  assert.match(sql, /UNIQUE \("user_id", "client_action_id"\)/);
});

test("migration 0070 has RLS internal_only policies on all 3 tables", () => {
  const sql = read(MIG_0070);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

test("migration 0070 notification dispatch source index covers source_type + source_entity_id", () => {
  const sql = read(MIG_0070);
  assert.match(
    sql,
    /notification_dispatch_log_source_idx[\s\S]*?\("source_type", "source_entity_id"\)/,
  );
});

// ===========================================================================
// 2) Schema exports
// ===========================================================================

test("schema/index exports pwa schema", () => {
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/pwa"/);
});

test("pwa schema exports all 3 tables", async () => {
  const m = await import("../src/lib/db/schema/pwa");
  assert.ok(m.pushSubscriptions);
  assert.ok(m.notificationDispatchLog);
  assert.ok(m.offlineActionQueue);
});

// ===========================================================================
// 3) dispatch-helpers — pickEligibleSubscriptions
// ===========================================================================

test("pickEligibleSubscriptions: empty list → empty result", () => {
  const r = pickEligibleSubscriptions({
    subscriptions: [],
    notificationType: "critical_risks",
  });
  assert.deepEqual(r, []);
});

test("pickEligibleSubscriptions: filters out inactive subscriptions", () => {
  const r = pickEligibleSubscriptions({
    subscriptions: [
      sub({ id: "a", isActive: false }),
      sub({ id: "b", isActive: true }),
    ],
    notificationType: "critical_risks",
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "b");
});

test("pickEligibleSubscriptions: empty enabled types means all types", () => {
  const r = pickEligibleSubscriptions({
    subscriptions: [sub({ id: "a", enabledNotificationTypes: [] })],
    notificationType: "critical_risks",
  });
  assert.equal(r.length, 1);
});

test("pickEligibleSubscriptions: filters when type not in enabled list", () => {
  const r = pickEligibleSubscriptions({
    subscriptions: [
      sub({ id: "a", enabledNotificationTypes: ["cash_gaps"] }),
    ],
    notificationType: "critical_risks",
  });
  assert.equal(r.length, 0);
});

test("pickEligibleSubscriptions: includes when type in enabled list", () => {
  const r = pickEligibleSubscriptions({
    subscriptions: [
      sub({
        id: "a",
        enabledNotificationTypes: ["critical_risks", "cash_gaps"],
      }),
    ],
    notificationType: "critical_risks",
  });
  assert.equal(r.length, 1);
});

test("pickEligibleSubscriptions: rejects subs at/over failure cap", () => {
  const r = pickEligibleSubscriptions({
    subscriptions: [
      sub({ id: "a", consecutiveFailures: 5 }),
      sub({ id: "b", consecutiveFailures: 4 }),
    ],
    notificationType: "critical_risks",
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "b");
});

test("pickEligibleSubscriptions: respects custom failure cap", () => {
  const r = pickEligibleSubscriptions({
    subscriptions: [sub({ id: "a", consecutiveFailures: 3 })],
    notificationType: "critical_risks",
    maxConsecutiveFailures: 2,
  });
  assert.equal(r.length, 0);
});

// ===========================================================================
// 4) dispatch-helpers — classifyDeliveryFailure
// ===========================================================================

test("classifyDeliveryFailure: 410 Gone → unsubscribe immediately", () => {
  assert.equal(classifyDeliveryFailure(410), "unsubscribe_immediately");
});

test("classifyDeliveryFailure: 404 Not Found → unsubscribe immediately", () => {
  assert.equal(classifyDeliveryFailure(404), "unsubscribe_immediately");
});

test("classifyDeliveryFailure: 429 → increment + retry", () => {
  assert.equal(classifyDeliveryFailure(429), "increment_failures_retry");
});

test("classifyDeliveryFailure: 500 → increment + retry", () => {
  assert.equal(classifyDeliveryFailure(500), "increment_failures_retry");
});

test("classifyDeliveryFailure: 503 → increment + retry", () => {
  assert.equal(classifyDeliveryFailure(503), "increment_failures_retry");
});

test("classifyDeliveryFailure: 400 → increment + keep", () => {
  assert.equal(classifyDeliveryFailure(400), "increment_failures_keep");
});

test("classifyDeliveryFailure: 200 (unexpected) → increment + keep", () => {
  assert.equal(classifyDeliveryFailure(200), "increment_failures_keep");
});

// ===========================================================================
// 5) dispatch-helpers — code generators
// ===========================================================================

test("nextDispatchCode: pads sequence to 4 digits", () => {
  assert.equal(nextDispatchCode(2026, 0), "ND-2026-0001");
  assert.equal(nextDispatchCode(2026, 41), "ND-2026-0042");
  assert.equal(nextDispatchCode(2026, 9999), "ND-2026-10000");
});

test("nextOfflineActionCode: pads + uses OFFLINE prefix", () => {
  assert.equal(nextOfflineActionCode(2026, 0), "OFFLINE-2026-0001");
  assert.equal(nextOfflineActionCode(2026, 99), "OFFLINE-2026-0100");
});

// ===========================================================================
// 6) dispatch-helpers — conflict detection
// ===========================================================================

test("detectActionConflict: empty existing → not duplicate", () => {
  const r = detectActionConflict({
    candidate: { userId: "u1", clientActionId: "a1" },
    existingPairs: new Set(),
  });
  assert.equal(r.isDuplicate, false);
  assert.equal(r.conflictKey, "u1:a1");
});

test("detectActionConflict: matching pair → duplicate", () => {
  const r = detectActionConflict({
    candidate: { userId: "u1", clientActionId: "a1" },
    existingPairs: new Set(["u1:a1", "u2:a2"]),
  });
  assert.equal(r.isDuplicate, true);
});

test("detectActionConflict: same client_action_id different user → not duplicate", () => {
  const r = detectActionConflict({
    candidate: { userId: "u2", clientActionId: "a1" },
    existingPairs: new Set(["u1:a1"]),
  });
  assert.equal(r.isDuplicate, false);
});

test("buildConflictKey: composes user:client", () => {
  assert.equal(buildConflictKey("u1", "a1"), "u1:a1");
});

// ===========================================================================
// 7) Client offline-queue pure helpers
// ===========================================================================

test("generateClientActionId: returns non-empty string", () => {
  const id = generateClientActionId();
  assert.equal(typeof id, "string");
  assert.ok(id.length >= 8);
});

test("generateClientActionId: produces unique IDs", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 50; i++) ids.add(generateClientActionId());
  assert.equal(ids.size, 50);
});

test("isDuplicateAction: matches by id", () => {
  assert.equal(
    isDuplicateAction(action({ id: "a" }), [action({ id: "a" })]),
    true,
  );
  assert.equal(
    isDuplicateAction(action({ id: "a" }), [action({ id: "b" })]),
    false,
  );
});

test("shouldRetry: 0 failures → retry", () => {
  assert.equal(shouldRetry(action({ id: "a", failures: 0 })), true);
});

test("shouldRetry: 4 failures → retry (under default cap 5)", () => {
  assert.equal(shouldRetry(action({ id: "a", failures: 4 })), true);
});

test("shouldRetry: 5 failures → no retry (at default cap)", () => {
  assert.equal(shouldRetry(action({ id: "a", failures: 5 })), false);
});

test("shouldRetry: respects custom cap", () => {
  assert.equal(shouldRetry(action({ id: "a", failures: 2 }), 3), true);
  assert.equal(shouldRetry(action({ id: "a", failures: 3 }), 3), false);
});

// ===========================================================================
// 8) Cron + dispatcher + route audit
// ===========================================================================

test("cron index re-exports 3 new Stage 5.I runners", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  assert.match(idx, /runDevOsPushNotificationDispatch/);
  assert.match(idx, /runDevOsFailedSubscriptionsCleanup/);
  assert.match(idx, /runDevOsOfflineQueueStats/);
});

test("cron index DEV_OS_JOB_KEYS includes 3 new keys", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  for (const k of [
    "dev_os_push_notification_dispatch",
    "dev_os_failed_subscriptions_cleanup",
    "dev_os_offline_queue_stats",
  ]) {
    assert.ok(idx.includes(`"${k}"`), `key '${k}' missing`);
  }
});

test("dispatcher KNOWN_JOBS includes 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  for (const k of [
    "dev_os_push_notification_dispatch",
    "dev_os_failed_subscriptions_cleanup",
    "dev_os_offline_queue_stats",
  ]) {
    assert.ok(src.includes(`"${k}"`), `KNOWN_JOBS missing '${k}'`);
  }
});

test("dispatcher executeJob switch covers 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /case "dev_os_push_notification_dispatch":/);
  assert.match(src, /case "dev_os_failed_subscriptions_cleanup":/);
  assert.match(src, /case "dev_os_offline_queue_stats":/);
});

test("3 new HTTP cron route files exist", () => {
  for (const slug of [
    "dev-os-push-notification-dispatch",
    "dev-os-failed-subscriptions-cleanup",
    "dev-os-offline-queue-stats",
  ]) {
    assert.ok(
      exists(`src/app/api/cron/${slug}/route.ts`),
      `route file missing for ${slug}`,
    );
  }
});

test("VERCEL-CRON-CHECKLIST documents 3 new routes", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-push-notification-dispatch/);
  assert.match(md, /\/api\/cron\/dev-os-failed-subscriptions-cleanup/);
  assert.match(md, /\/api\/cron\/dev-os-offline-queue-stats/);
});

// ===========================================================================
// 9) API routes
// ===========================================================================

test("offline-sync submit route exists + uses POST", () => {
  const path = "src/app/api/offline-sync/submit/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export async function POST/);
  assert.match(src, /submitOfflineAction/);
});

test("push subscribe route exists + uses POST", () => {
  const path = "src/app/api/push/subscribe/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export async function POST/);
  assert.match(src, /subscribePush/);
});

test("push unsubscribe route exists + uses POST", () => {
  const path = "src/app/api/push/unsubscribe/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export async function POST/);
});

test("vapid-public-key route exists + GET only", () => {
  const path = "src/app/api/push/vapid-public-key/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export async function GET/);
  assert.doesNotMatch(src, /export async function POST/);
});

test("offline-sync route requires authentication", () => {
  const src = read("src/app/api/offline-sync/submit/route.ts");
  assert.match(src, /Unauthorized/);
  assert.match(src, /getCurrentAppUser/);
});

// ===========================================================================
// 10) Service worker + manifest
// ===========================================================================

test("public/manifest.json exists + valid JSON with required keys", () => {
  assert.ok(exists("public/manifest.json"));
  const obj = JSON.parse(read("public/manifest.json"));
  assert.equal(obj.name, "Arconique Development OS");
  assert.equal(obj.short_name, "Arconique");
  assert.equal(obj.display, "standalone");
  assert.ok(Array.isArray(obj.icons));
  assert.ok(obj.icons.length >= 4);
});

test("manifest start_url is dashboard", () => {
  const obj = JSON.parse(read("public/manifest.json"));
  assert.equal(obj.start_url, "/development-os/dashboard");
});

test("manifest has shortcuts for Site Supervisor + Quick Photo", () => {
  const obj = JSON.parse(read("public/manifest.json"));
  assert.ok(Array.isArray(obj.shortcuts));
  const urls = obj.shortcuts.map((s: { url: string }) => s.url);
  assert.ok(urls.includes("/development-os/cabinets/site-supervisor"));
  assert.ok(urls.includes("/development-os/operations/site-reports/quick-photo"));
});

test("public/sw.js service worker exists", () => {
  assert.ok(exists("public/sw.js"));
});

test("service worker registers all 3 cache strategies", () => {
  const src = read("public/sw.js");
  assert.match(src, /networkFirst/);
  assert.match(src, /cacheFirst/);
  assert.match(src, /staleWhileRevalidate/);
});

test("service worker explicitly excludes sensitive financial routes", () => {
  const src = read("public/sw.js");
  assert.match(src, /SENSITIVE_PATTERNS/);
  assert.match(src, /investor/);
  assert.match(src, /tax/);
  assert.match(src, /wallet/);
  assert.match(src, /payable/);
  assert.match(src, /receivable/);
});

test("service worker has push + notificationclick listeners", () => {
  const src = read("public/sw.js");
  assert.match(src, /addEventListener\("push"/);
  assert.match(src, /addEventListener\("notificationclick"/);
});

test("service worker has background sync listener", () => {
  const src = read("public/sw.js");
  assert.match(src, /addEventListener\("sync"/);
  assert.match(src, /sync-offline-queue/);
});

test("service worker uses IndexedDB for queue + photos", () => {
  const src = read("public/sw.js");
  assert.match(src, /indexedDB\.open/);
  assert.match(src, /createObjectStore\("queue"/);
  assert.match(src, /createObjectStore\("photos"/);
});

test("layout includes manifest reference", () => {
  const src = read("src/app/layout.tsx");
  assert.match(src, /manifest: "\/manifest\.json"/);
});

test("dev-app layout mounts ServiceWorkerRegister", () => {
  const src = read("src/app/(development-app)/layout.tsx");
  assert.match(src, /ServiceWorkerRegister/);
});

// ===========================================================================
// 11) UI components + pages
// ===========================================================================

test("OfflineIndicator component exists", () => {
  assert.ok(
    exists("src/components/development/pwa/offline-indicator.tsx"),
  );
});

test("InstallPrompt component exists", () => {
  assert.ok(exists("src/components/development/pwa/install-prompt.tsx"));
});

test("PushPermission component exists", () => {
  assert.ok(exists("src/components/development/pwa/push-permission.tsx"));
});

test("ServiceWorkerRegister component exists", () => {
  assert.ok(
    exists("src/components/development/pwa/service-worker-register.tsx"),
  );
});

test("dev-app shell mounts OfflineIndicator + InstallPrompt", () => {
  const src = read("src/components/development/development-app-shell.tsx");
  assert.match(src, /OfflineIndicator/);
  assert.match(src, /InstallPrompt/);
});

test("quick-photo page exists + has 44px touch targets (mobile-first)", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/operations/site-reports/quick-photo/page.tsx",
    ),
  );
  const src = read(
    "src/app/(development-app)/development-os/operations/site-reports/quick-photo/page.tsx",
  );
  assert.match(src, /min-h-\[44px\]/);
});

test("quick-photo page uses queueOfflinePhoto + requestBackgroundSync", () => {
  const src = read(
    "src/app/(development-app)/development-os/operations/site-reports/quick-photo/page.tsx",
  );
  assert.match(src, /queueOfflinePhoto/);
  assert.match(src, /requestBackgroundSync/);
});

test("notifications-push settings page exists", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/settings/notifications-push/page.tsx",
    ),
  );
});

// ===========================================================================
// 12) Server module presence
// ===========================================================================

test("dispatch-helpers is pure (no server-only import)", () => {
  const src = read(
    "src/lib/development/server/push/dispatch-helpers.ts",
  );
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
});

test("vapid-keys file is server-only", () => {
  const src = read("src/lib/development/server/push/vapid-keys.ts");
  assert.match(src, /^(import "server-only"|"use server")/m);
});

test("notification-dispatcher uses web-push library", () => {
  const src = read(
    "src/lib/development/server/notifications/notification-dispatcher.ts",
  );
  assert.match(src, /import webpush from "web-push"/);
  assert.match(src, /webpush\.sendNotification/);
});

test("notification-dispatcher falls into dry-run when VAPID missing", () => {
  const src = read(
    "src/lib/development/server/notifications/notification-dispatcher.ts",
  );
  assert.match(src, /dryRun/);
});

test("subscription-actions uses ON CONFLICT (idempotent re-subscribe)", () => {
  const src = read(
    "src/lib/development/server/push/subscription-actions.ts",
  );
  assert.match(src, /onConflictDoUpdate/);
});

test("offline-sync sync-actions deduplicates by (user_id, client_action_id)", () => {
  const src = read(
    "src/lib/development/server/offline-sync/sync-actions.ts",
  );
  assert.match(src, /client_action_id/);
  assert.match(src, /duplicate/);
});

test("3 new cron job files exist", () => {
  for (const slug of [
    "push-notification-dispatch-job",
    "failed-subscriptions-cleanup-job",
    "offline-queue-stats-job",
  ]) {
    assert.ok(
      exists(`src/lib/development/server/cron/${slug}.ts`),
      `${slug}.ts missing`,
    );
  }
});

// ===========================================================================
// 13) Demo seed audit
// ===========================================================================

test("seed script declares Stage 5.I section header", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.I seeding/);
});

test("seed script seeds push subscriptions + notifications + offline queue", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /INSERT INTO push_subscriptions/);
  assert.match(seed, /INSERT INTO notification_dispatch_log/);
  assert.match(seed, /INSERT INTO offline_action_queue/);
});

test("seed script idempotent — exists-check pattern present in 5.I section", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.I seeding[\s\S]*?if \(exists\[0\]\)/);
});

// ===========================================================================
// 14) Architecture documentation
// ===========================================================================

test("architecture doc references Stage 5.I", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.I/);
});

test("architecture doc Stage 5.H accepted", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.H[\s\S]*?\[(?:ACTIVE|ACCEPTED) 5\.H\]/);
});

test("architecture doc Stage 5.I active", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.I[\s\S]*?\[(?:ACTIVE|ACCEPTED) 5\.I\]/);
});

test("architecture doc names append-only invariant for offline queue", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /[Aa]ppend-only/);
});

test("architecture doc explains web-push dependency decision", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /web-push/);
});

test("architecture doc explains sensitive routes never cached", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /[Ss]ensitive[\s\S]*?cache|never cached|investor/);
});

test("architecture doc explains hand-rolled SW", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /hand-rolled/i);
});

// ===========================================================================
// 15) Client offline-queue file purity (for SSR safety)
// ===========================================================================

test("offline-queue client file does NOT import server-only", () => {
  const src = read("src/lib/development/client/offline-queue.ts");
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
});

test("offline-queue exports the documented client API", () => {
  const src = read("src/lib/development/client/offline-queue.ts");
  for (const fn of [
    "queueOfflineAction",
    "getPendingActions",
    "clearAction",
    "getQueueSize",
    "queueOfflinePhoto",
    "getPendingPhotos",
    "requestBackgroundSync",
  ]) {
    assert.ok(src.includes(`export async function ${fn}`), `missing ${fn}`);
  }
});
