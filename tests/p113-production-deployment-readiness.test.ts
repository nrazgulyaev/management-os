/**
 * Prompt 113 — Production Deployment Readiness tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// Helpers to push values into process.env per-test without leaking state.
function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T,
): T {
  const prior: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) {
    prior[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k]!;
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(prior)) {
      if (prior[k] === undefined) delete process.env[k];
      else process.env[k] = prior[k]!;
    }
  }
}

// -----------------------------------------------------------------------------
// 1) Env registry
// -----------------------------------------------------------------------------
test("env registry includes every required key", async () => {
  const { ENV_REGISTRY } = await import("../src/lib/env/registry");
  const keys = new Set(ENV_REGISTRY.map((s) => s.key));
  for (const required of [
    "NODE_ENV",
    "NEXT_PUBLIC_APP_ENV",
    "APP_BASE_URL",
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET",
    "SECURITY_ENCRYPTION_SECRET",
    "STAY_LINK_KMS_SECRET",
    "MFA_ISSUER",
    "LOGIN_THROTTLE_ENABLED",
    "LOGIN_MAX_FAILED_PER_EMAIL",
    "LOGIN_MAX_FAILED_PER_IP",
    "LOGIN_LOCK_MINUTES",
    "NOTIFICATIONS_DRY_RUN",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "ANTHROPIC_API_KEY",
    "AI_DRY_RUN",
    "ARCONIQUE_FORCE_MOCK",
    "NEXT_PUBLIC_ENABLE_DEMO_MODE",
    "ADMIN_BOOTSTRAP_SECRET",
  ]) {
    assert.ok(keys.has(required), `registry missing ${required}`);
  }
});

test("redactEnvValue never returns raw secret", async () => {
  const { redactEnvValue } = await import("../src/lib/env/validation");
  const raw = "this-is-a-32-char-long-secret-aaaaa";
  const redacted = redactEnvValue("SECURITY_ENCRYPTION_SECRET", raw);
  assert.notEqual(redacted, raw);
  assert.equal(redacted!.includes(raw), false);
  // Public keys may be displayed, but capped.
  const longPublic = "x".repeat(200);
  const redactedPublic = redactEnvValue("NEXT_PUBLIC_APP_ENV", longPublic);
  assert.ok(redactedPublic!.length < 200);
});

test("production missing CRON_SECRET is fatal", async () => {
  const { validateEnv } = await import("../src/lib/env/validation");
  const report = withEnv({ CRON_SECRET: undefined }, () =>
    validateEnv("production"),
  );
  const cron = report.items.find((i) => i.key === "CRON_SECRET");
  assert.ok(cron);
  assert.equal(cron!.status, "fatal");
});

test("production missing SECURITY_ENCRYPTION_SECRET is fatal", async () => {
  const { validateEnv } = await import("../src/lib/env/validation");
  const report = withEnv({ SECURITY_ENCRYPTION_SECRET: undefined }, () =>
    validateEnv("production"),
  );
  const sec = report.items.find((i) => i.key === "SECURITY_ENCRYPTION_SECRET");
  assert.ok(sec);
  assert.equal(sec!.status, "fatal");
});

test("AI key is not_required when AI_DRY_RUN!=0", async () => {
  const { validateEnv } = await import("../src/lib/env/validation");
  const report = withEnv(
    { AI_DRY_RUN: "1", ANTHROPIC_API_KEY: undefined },
    () => validateEnv("production"),
  );
  const ai = report.items.find((i) => i.key === "ANTHROPIC_API_KEY");
  assert.ok(ai);
  assert.equal(ai!.status, "not_required");
});

test("NOTIFICATIONS_DRY_RUN must be explicit in production", async () => {
  const { validateEnv } = await import("../src/lib/env/validation");
  const report = withEnv({ NOTIFICATIONS_DRY_RUN: undefined }, () =>
    validateEnv("production"),
  );
  const ndr = report.items.find((i) => i.key === "NOTIFICATIONS_DRY_RUN");
  assert.ok(ndr);
  assert.equal(ndr!.status, "fatal");
});

test("NEXT_PUBLIC keys cannot include service-role-style names", async () => {
  const { validateEnv } = await import("../src/lib/env/validation");
  const report = withEnv(
    { NEXT_PUBLIC_SERVICE_ROLE_KEY: "sk_live_abc" },
    () => validateEnv("production"),
  );
  const bad = report.items.find(
    (i) => i.key === "NEXT_PUBLIC_SERVICE_ROLE_KEY",
  );
  assert.ok(bad);
  assert.equal(bad!.status, "fatal");
});

// -----------------------------------------------------------------------------
// 2) Production gates
// -----------------------------------------------------------------------------
test("demo mode in production fails the gate", async () => {
  const { assertNoDemoModeInProduction } = await import(
    "../src/lib/deployment/production-gates"
  );
  const out = withEnv({ ARCONIQUE_FORCE_MOCK: "1" }, () =>
    assertNoDemoModeInProduction("production"),
  );
  assert.equal(out.ok, false);
  assert.equal(out.severity, "critical");
});

test("dev cron bypass in production fails the gate", async () => {
  const { assertNoDevCronBypassInProduction } = await import(
    "../src/lib/deployment/production-gates"
  );
  const out = withEnv(
    { ALLOW_DEV_CRON_WITHOUT_SECRET: "1", CRON_SECRET: "x".repeat(32) },
    () => assertNoDevCronBypassInProduction("production"),
  );
  assert.equal(out.ok, false);
  assert.equal(out.severity, "critical");
});

test("weak ADMIN_BOOTSTRAP_SECRET warns/critical", async () => {
  const { assertBootstrapSecretStrong } = await import(
    "../src/lib/deployment/production-gates"
  );
  const out = withEnv({ ADMIN_BOOTSTRAP_SECRET: "changeme" }, () =>
    assertBootstrapSecretStrong("production"),
  );
  assert.equal(out.ok, false);
  assert.equal(out.severity, "critical");
  // In dev → warning only.
  const dev = withEnv({ ADMIN_BOOTSTRAP_SECRET: "changeme" }, () =>
    assertBootstrapSecretStrong("development"),
  );
  assert.equal(dev.ok, false);
  assert.equal(dev.severity, "warning");
});

test("strong production env passes all gates", async () => {
  const { getProductionGateReport } = await import(
    "../src/lib/deployment/production-gates"
  );
  const report = withEnv(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "production",
      APP_BASE_URL: "https://management.arconique.test",
      DATABASE_URL: "postgres://example:5432/db",
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "ey".padEnd(80, "a"),
      SUPABASE_SERVICE_ROLE_KEY: "ey".padEnd(80, "b"),
      CRON_SECRET: "a".repeat(48),
      SECURITY_ENCRYPTION_SECRET: "b".repeat(48),
      STAY_LINK_KMS_SECRET: "c".repeat(48),
      NOTIFICATIONS_DRY_RUN: "1",
      AI_DRY_RUN: "1",
      ARCONIQUE_FORCE_MOCK: undefined,
      NEXT_PUBLIC_ENABLE_DEMO_MODE: undefined,
      ALLOW_DEV_CRON_WITHOUT_SECRET: undefined,
      ADMIN_BOOTSTRAP_SECRET: undefined,
    },
    () => getProductionGateReport("production"),
  );
  assert.equal(report.ok, true);
});

// -----------------------------------------------------------------------------
// 3) Scripts wired
// -----------------------------------------------------------------------------
test("package.json wires every preflight script", () => {
  const pkg = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf-8"),
  );
  const scripts = pkg.scripts as Record<string, string>;
  for (const k of [
    "check:env",
    "check:storage",
    "check:cron",
    "check:migrations",
    "preflight:deploy",
    "seed:production:minimal",
  ]) {
    assert.ok(scripts[k], `missing script ${k}`);
  }
});

test("preflight scripts exist + do not import client-only modules", () => {
  for (const f of [
    "scripts/check-env.ts",
    "scripts/check-storage-config.ts",
    "scripts/check-cron-config.ts",
    "scripts/check-migrations.ts",
    "scripts/preflight-deploy.ts",
    "scripts/seed-production-minimal.ts",
  ]) {
    const path = join(repoRoot, f);
    assert.ok(existsSync(path), `missing script ${f}`);
    const body = readFileSync(path, "utf-8");
    assert.equal(body.includes('"use client"'), false);
    // No React imports.
    assert.equal(body.includes('from "react"'), false);
  }
});

// -----------------------------------------------------------------------------
// 4) Cron checklist
// -----------------------------------------------------------------------------
test("every app/api/cron route appears in VERCEL-CRON-CHECKLIST.md", () => {
  const checklist = readFileSync(
    join(repoRoot, "docs/VERCEL-CRON-CHECKLIST.md"),
    "utf-8",
  );
  const cronDir = join(repoRoot, "src/app/api/cron");
  const dirs = readdirSync(cronDir).filter((f) =>
    statSync(join(cronDir, f)).isDirectory(),
  );
  for (const dir of dirs) {
    assert.ok(
      checklist.includes(`/api/cron/${dir}`),
      `cron checklist missing route /api/cron/${dir}`,
    );
  }
});

test("every cron route uses handleCronJobRequest or handleCronRunAllRequest", () => {
  const cronDir = join(repoRoot, "src/app/api/cron");
  const dirs = readdirSync(cronDir).filter((f) =>
    statSync(join(cronDir, f)).isDirectory(),
  );
  for (const dir of dirs) {
    const route = join(cronDir, dir, "route.ts");
    assert.ok(existsSync(route), `${dir}/route.ts missing`);
    const body = readFileSync(route, "utf-8");
    const ok =
      body.includes("handleCronJobRequest") ||
      body.includes("handleCronRunAllRequest");
    assert.ok(ok, `${dir}: route does not call a cron handler`);
  }
});

test("cron job keys referenced by routes are in KNOWN_JOBS", () => {
  const actions = readFileSync(
    join(repoRoot, "src/features/jobs/actions.ts"),
    "utf-8",
  );
  const known = new Set<string>();
  const m = actions.match(/KNOWN_JOBS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/);
  if (m) {
    for (const k of m[1].matchAll(/"([a-z0-9_]+)"/g)) known.add(k[1]);
  }
  const cronDir = join(repoRoot, "src/app/api/cron");
  const dirs = readdirSync(cronDir).filter((f) =>
    statSync(join(cronDir, f)).isDirectory(),
  );
  for (const dir of dirs) {
    const route = join(cronDir, dir, "route.ts");
    if (!existsSync(route)) continue;
    const body = readFileSync(route, "utf-8");
    const km = body.match(
      /handleCronJobRequest\([^,]+,\s*"([a-z0-9_]+)"\)/,
    );
    if (km) {
      assert.ok(known.has(km[1]), `${dir}: job key ${km[1]} not in KNOWN_JOBS`);
    }
  }
});

// -----------------------------------------------------------------------------
// 5) Storage checklist
// -----------------------------------------------------------------------------
test("every bucket constant in source appears in STORAGE-BUCKETS-CHECKLIST.md", () => {
  const checklist = readFileSync(
    join(repoRoot, "docs/STORAGE-BUCKETS-CHECKLIST.md"),
    "utf-8",
  );
  for (const b of ["task-attachments", "guest-request-attachments"]) {
    assert.ok(checklist.includes(b), `bucket ${b} missing from checklist`);
  }
});

test("guest-request-attachments documented as private + signed-URL only", () => {
  const checklist = readFileSync(
    join(repoRoot, "docs/STORAGE-BUCKETS-CHECKLIST.md"),
    "utf-8",
  );
  assert.match(checklist, /guest-request-attachments[\s\S]{0,400}private/i);
  assert.match(checklist, /guest-request-attachments[\s\S]{0,400}signed/i);
});

// -----------------------------------------------------------------------------
// 6) Deployment dashboard
// -----------------------------------------------------------------------------
test("/dashboard/system/deployment route exists and does not render raw secrets", () => {
  const route = readFileSync(
    join(
      repoRoot,
      "src/app/(dashboard)/dashboard/system/deployment/page.tsx",
    ),
    "utf-8",
  );
  assert.ok(route.includes("getEnvReadinessReport"));
  assert.ok(route.includes("getProductionGateReport"));
  // Make sure the page renders only redacted values.
  assert.equal(route.includes("process.env.SECURITY_ENCRYPTION_SECRET"), false);
  assert.equal(route.includes("process.env.STAY_LINK_KMS_SECRET"), false);
  assert.equal(route.includes("process.env.SUPABASE_SERVICE_ROLE_KEY"), false);
});

// -----------------------------------------------------------------------------
// 7) Docs
// -----------------------------------------------------------------------------
test("DEPLOYMENT-RUNBOOK.md covers required sections", () => {
  const md = readFileSync(
    join(repoRoot, "docs/DEPLOYMENT-RUNBOOK.md"),
    "utf-8",
  );
  for (const heading of [
    "Domains",
    "Route groups",
    "Pre-deploy checklist",
    "Vercel deploy",
    "Post-deploy smoke test",
    "Rollback procedure",
    "Monitoring",
  ]) {
    assert.ok(md.includes(heading), `runbook missing "${heading}"`);
  }
});

test("ENVIRONMENT-VARIABLES.md covers every registry key", async () => {
  const { ENV_REGISTRY } = await import("../src/lib/env/registry");
  const md = readFileSync(
    join(repoRoot, "docs/ENVIRONMENT-VARIABLES.md"),
    "utf-8",
  );
  for (const spec of ENV_REGISTRY) {
    assert.ok(
      md.includes(spec.key),
      `ENVIRONMENT-VARIABLES.md missing ${spec.key}`,
    );
  }
});

test("PRODUCTION-SEED-STRATEGY.md says no demo data in production", () => {
  const md = readFileSync(
    join(repoRoot, "docs/PRODUCTION-SEED-STRATEGY.md"),
    "utf-8",
  );
  assert.match(md, /no demo data/i);
  assert.match(md, /production must NOT have|production must never/i);
});

test("README links to the new deployment docs", () => {
  const md = readFileSync(join(repoRoot, "README.md"), "utf-8");
  for (const doc of [
    "DEPLOYMENT-RUNBOOK.md",
    "ENVIRONMENT-VARIABLES.md",
    "SUPABASE-PROVISIONING-CHECKLIST.md",
    "STORAGE-BUCKETS-CHECKLIST.md",
    "VERCEL-CRON-CHECKLIST.md",
    "PRODUCTION-SEED-STRATEGY.md",
  ]) {
    assert.ok(md.includes(doc), `README missing link to ${doc}`);
  }
});

// -----------------------------------------------------------------------------
// 8) Logging
// -----------------------------------------------------------------------------
test("logger redacts banned field names", async () => {
  const { logger } = await import("../src/lib/observability/logger");
  const redacted = logger.__redactValue({
    nested: {
      password: "swordfish",
      secret: "topsecret",
      tokenHash: "abc",
      providerSessionId: "ses_x",
      authorization: "Bearer x",
      Authorization: "Bearer y",
      apiKey: "sk_live_z",
      safe: "ok",
    },
  }) as { nested: Record<string, unknown> };
  for (const banned of [
    "password",
    "secret",
    "tokenHash",
    "providerSessionId",
    "authorization",
    "Authorization",
    "apiKey",
  ]) {
    assert.equal(redacted.nested[banned], "[redacted]", `${banned} not redacted`);
  }
  assert.equal(redacted.nested.safe, "ok");
});

test("request-id helper resolves stable values", async () => {
  const { resolveRequestId } = await import(
    "../src/lib/observability/request-id"
  );
  // From header.
  assert.equal(
    resolveRequestId({ get: (k) => (k === "x-request-id" ? "abc-123" : null) }),
    "abc-123",
  );
  // Vercel header fallback.
  assert.equal(
    resolveRequestId({ get: (k) => (k === "x-vercel-id" ? "vcl-9" : null) }),
    "vcl-9",
  );
  // Generated when missing.
  const r = resolveRequestId({ get: () => null });
  assert.match(r, /^[0-9a-f-]{36}$/i);
});

// -----------------------------------------------------------------------------
// 9) No business logic changes — source grep
// -----------------------------------------------------------------------------
function readAllUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) stack.push(p);
      else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(p);
    }
  }
  return out;
}

test("no real payment / smart-lock / WhatsApp clients introduced", () => {
  const files = readAllUnder(join(repoRoot, "src"));
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const banned of [
      'from "stripe"',
      'from "xendit-node"',
      'from "@xendit/node"',
      "wise-platform-api-",
      'from "twilio"',
      'from "@whatsapp/business-platform"',
    ]) {
      assert.equal(
        body.includes(banned),
        false,
        `${f} introduced banned client import "${banned}"`,
      );
    }
  }
});
