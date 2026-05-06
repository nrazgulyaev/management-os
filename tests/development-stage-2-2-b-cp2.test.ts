/**
 * Stage 2.2.B Checkpoint 2 regression — Invoice PDF + cron worker +
 * email helper + notification UI + project Sales tab + lead reservation
 * tab.
 *
 * Pure-function and static-source tests; no DB / network required.
 * Heavier integration tests are intentionally manual (the manual-test
 * checklist in the final summary covers them).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// ----------------------------------------------------------------------------
// Files exist + structure invariants
// ----------------------------------------------------------------------------

test("invoice PDF template + render module + translations exist", () => {
  const root = resolve(process.cwd(), "src/lib/development/pdf");
  for (const p of [
    "invoice-pdf.tsx",
    "render-invoice-pdf.ts",
    "invoice-translations.ts",
  ]) {
    assert.ok(existsSync(resolve(root, p)), `Missing PDF file: ${p}`);
  }
});

test("invoice translations cover EN / RU / ID", async () => {
  const mod = await import(
    "../src/lib/development/pdf/invoice-translations"
  );
  for (const lang of ["en", "ru", "id"]) {
    const s = mod.getInvoiceStrings(lang);
    assert.ok(s.documentTypeStandard, `${lang}: documentTypeStandard`);
    assert.ok(s.invoiceNumberLabel, `${lang}: invoiceNumberLabel`);
    assert.ok(s.grandTotal, `${lang}: grandTotal`);
    assert.ok(s.equivalentIdr, `${lang}: equivalentIdr`);
    assert.ok(s.paymentInstructions, `${lang}: paymentInstructions`);
    assert.ok(s.fxDisclaimer, `${lang}: fxDisclaimer`);
  }
});

test("invoice translations fall back to English on unknown language", async () => {
  const { getInvoiceStrings } = await import(
    "../src/lib/development/pdf/invoice-translations"
  );
  const fr = getInvoiceStrings("fr");
  const en = getInvoiceStrings("en");
  assert.equal(fr.documentTypeStandard, en.documentTypeStandard);
});

test("Russian invoice strings use Cyrillic", async () => {
  const { getInvoiceStrings } = await import(
    "../src/lib/development/pdf/invoice-translations"
  );
  const ru = getInvoiceStrings("ru");
  assert.match(ru.documentTypeStandard, /[А-Яа-я]/);
  assert.match(ru.grandTotal, /[А-Яа-я]/);
  assert.match(ru.paymentInstructions, /[А-Яа-я]/);
});

// ----------------------------------------------------------------------------
// Cron registration invariants
// ----------------------------------------------------------------------------

test("Dev OS cron job keys registered in JobKey union + KNOWN_JOBS", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/features/jobs/actions.ts"),
    "utf8",
  );
  for (const key of [
    "dev_os_pricing_apply",
    "dev_os_reservation_expiry",
    "dev_os_milestone_pre_invoice",
    "dev_os_milestone_invoice",
    "dev_os_milestone_overdue",
    "dev_os_late_fee_accrual",
    "dev_os_notification_dispatch",
  ]) {
    assert.ok(
      src.includes(`"${key}"`),
      `JobKey union must include ${key}`,
    );
  }
});

test("All seven Dev OS cron HTTP routes exist", () => {
  const root = resolve(process.cwd(), "src/app/api/cron");
  for (const dir of [
    "dev-os-pricing-apply",
    "dev-os-reservation-expiry",
    "dev-os-milestone-pre-invoice",
    "dev-os-milestone-invoice",
    "dev-os-milestone-overdue",
    "dev-os-late-fee-accrual",
    "dev-os-notification-dispatch",
  ]) {
    const route = resolve(root, dir, "route.ts");
    assert.ok(existsSync(route), `Cron route missing: ${dir}/route.ts`);
    const body = readFileSync(route, "utf8");
    assert.ok(
      body.includes("handleCronJobRequest"),
      `${dir} must call handleCronJobRequest`,
    );
  }
});

test("VERCEL-CRON-CHECKLIST documents every Dev OS cron route", () => {
  const checklist = readFileSync(
    resolve(process.cwd(), "docs/VERCEL-CRON-CHECKLIST.md"),
    "utf8",
  );
  for (const path of [
    "/api/cron/dev-os-pricing-apply",
    "/api/cron/dev-os-reservation-expiry",
    "/api/cron/dev-os-milestone-pre-invoice",
    "/api/cron/dev-os-milestone-invoice",
    "/api/cron/dev-os-milestone-overdue",
    "/api/cron/dev-os-late-fee-accrual",
    "/api/cron/dev-os-notification-dispatch",
  ]) {
    assert.ok(
      checklist.includes(path),
      `Checklist must mention ${path}`,
    );
  }
});

test("scripts/cron-development-os.ts wraps the seven Dev OS jobs", () => {
  const path = resolve(process.cwd(), "scripts/cron-development-os.ts");
  assert.ok(existsSync(path), "Cron wrapper script must exist");
  const body = readFileSync(path, "utf8");
  assert.ok(
    body.includes("DEV_OS_JOB_KEYS"),
    "Wrapper must iterate DEV_OS_JOB_KEYS",
  );
  assert.ok(
    body.includes("executeJob"),
    "Wrapper must delegate to executeJob (same path as HTTP routes)",
  );
});

test("Dev OS cron index re-exports all seven runners (static check)", () => {
  // Static-source check: node:test cannot dynamically import modules
  // that carry `import "server-only"`, so we read the index file
  // directly. The actual cron runners are exercised via the HTTP cron
  // routes + manual cron checklist.
  const body = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/cron/index.ts"),
    "utf8",
  );
  for (const fn of [
    "runDevOsPricingApply",
    "runDevOsReservationExpiry",
    "runDevOsMilestonePreInvoice",
    "runDevOsMilestoneInvoice",
    "runDevOsMilestoneOverdue",
    "runDevOsLateFeeAccrual",
    "runDevOsNotificationDispatch",
  ]) {
    assert.ok(
      body.includes(fn),
      `Cron index must re-export ${fn}`,
    );
  }
  assert.ok(
    body.includes("DEV_OS_JOB_KEYS"),
    "Cron index must export DEV_OS_JOB_KEYS for the wrapper script",
  );
});

// ----------------------------------------------------------------------------
// Email helper invariants
// ----------------------------------------------------------------------------

test("Email helper file exists and exports the public API", () => {
  const path = resolve(
    process.cwd(),
    "src/lib/development/server/email.ts",
  );
  assert.ok(existsSync(path), "email.ts must exist");
  const body = readFileSync(path, "utf8");
  assert.ok(
    body.includes("export async function sendDevOsEmail"),
    "email.ts must export sendDevOsEmail",
  );
  assert.ok(
    body.includes("_setEmailProviderForTest"),
    "email.ts must expose a test seam",
  );
});

test("Email helper honors EMAIL_DRY_RUN by default", () => {
  // We can't import the server-only module in node:test; static check
  // confirms the gating logic is present.
  const body = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/email.ts"),
    "utf8",
  );
  assert.ok(
    body.includes("EMAIL_DRY_RUN"),
    "email helper must read EMAIL_DRY_RUN",
  );
  assert.ok(
    body.includes("isResendConfigured"),
    "email helper must respect existing isResendConfigured()",
  );
  assert.ok(
    body.includes("dry_run"),
    "email helper must produce a dry_run status",
  );
});

// ----------------------------------------------------------------------------
// PDF render produces real bytes
// ----------------------------------------------------------------------------

test("Sample invoice PDFs were generated as artifacts", () => {
  const dir = resolve(process.cwd(), "tmp/sample-invoices");
  const samples = [
    "invoice-en-eternal-04-construction-milestone.pdf",
    "invoice-ru-enso-05-final-vat.pdf",
    "invoice-id-ahau-08-pre-invoice.pdf",
  ];
  for (const f of samples) {
    const p = resolve(dir, f);
    if (!existsSync(p)) {
      assert.fail(
        `Sample missing: ${f}. Run \`npx tsx scripts/generate-sample-invoices.ts\` to regenerate.`,
      );
    }
    const size = statSync(p).size;
    assert.ok(
      size > 4000,
      `${f} should be >4KB (got ${size}); empty or near-empty PDF suggests render failure`,
    );
    // Confirm PDF magic bytes.
    const buf = readFileSync(p);
    assert.equal(
      buf.slice(0, 4).toString("ascii"),
      "%PDF",
      `${f} must start with %PDF magic`,
    );
  }
});

// ----------------------------------------------------------------------------
// Notification admin UI surface exists
// ----------------------------------------------------------------------------

test("Notification rules admin page exists at the documented route", () => {
  const path = resolve(
    process.cwd(),
    "src/app/(development-app)/development-os/settings/notifications/page.tsx",
  );
  assert.ok(existsSync(path), "Admin route must exist");
  const body = readFileSync(path, "utf8");
  assert.ok(
    body.includes("NotificationRulesTabs"),
    "Admin page must mount the tabs component",
  );
  assert.ok(
    body.includes("getNotificationRules"),
    "Admin page must fetch rules server-side",
  );
});

test("Notification tabs component is a client component", () => {
  const path = resolve(
    process.cwd(),
    "src/components/development/notifications/notification-rules-tabs.tsx",
  );
  const body = readFileSync(path, "utf8");
  assert.ok(
    body.startsWith('"use client";'),
    "Tabs component must be 'use client'",
  );
  assert.ok(
    !body.includes('import "server-only"'),
    "Tabs component must not import server-only",
  );
});

// ----------------------------------------------------------------------------
// Project Sales tab + Lead reservation tab structure
// ----------------------------------------------------------------------------

test("Project sales unified view exists", () => {
  const path = resolve(
    process.cwd(),
    "src/components/development/sales/project-sales-unified.tsx",
  );
  assert.ok(existsSync(path), "ProjectSalesUnified must exist");
  const body = readFileSync(path, "utf8");
  assert.ok(
    body.includes("ProjectSalesUnified"),
    "Must export ProjectSalesUnified",
  );
  assert.ok(
    !body.startsWith('"use client";'),
    "ProjectSalesUnified should be a server component (no client-side state)",
  );
});

test("Lead reservation/contract tab component exists and is server-renderable", () => {
  const path = resolve(
    process.cwd(),
    "src/components/development/sales/lead-reservation-contract-tab.tsx",
  );
  assert.ok(existsSync(path), "Tab component must exist");
  const body = readFileSync(path, "utf8");
  assert.ok(
    body.includes("LeadReservationContractTab"),
    "Must export LeadReservationContractTab",
  );
  assert.ok(
    !body.includes('import "server-only"'),
    "Component must not import server-only",
  );
});

test("Lead detail page uses the new reservation tab", () => {
  const path = resolve(
    process.cwd(),
    "src/app/(development-app)/development-os/sales/[contactRoleId]/page.tsx",
  );
  const body = readFileSync(path, "utf8");
  assert.ok(
    body.includes("LeadReservationContractTab"),
    "Lead detail must mount LeadReservationContractTab",
  );
  assert.ok(
    body.includes("getLeadSalesSnapshot"),
    "Lead detail must call getLeadSalesSnapshot",
  );
});

test("Project detail page uses ProjectSalesUnified for the Sales tab", () => {
  const path = resolve(
    process.cwd(),
    "src/app/(development-app)/development-os/projects/[slug]/page.tsx",
  );
  const body = readFileSync(path, "utf8");
  assert.ok(
    body.includes("ProjectSalesUnified"),
    "Project detail must mount ProjectSalesUnified",
  );
  assert.ok(
    body.includes("getProjectSalesData"),
    "Project detail must call getProjectSalesData",
  );
});

// ----------------------------------------------------------------------------
// Workspace separation regression — Cp2 must not leak into Management OS
// ----------------------------------------------------------------------------

test("dashboardNav still has zero /development-os/* routes after Cp2", async () => {
  const { dashboardNav } = await import("../src/config/navigation");
  for (const group of dashboardNav) {
    for (const item of group.items) {
      assert.ok(
        !item.href.startsWith("/development-os"),
        `Management OS sidebar leaked Development OS route: ${item.href}`,
      );
    }
  }
});

test("Cp2 added zero new top-level dependencies", () => {
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
  );
  for (const dep of [
    "puppeteer",
    "puppeteer-core",
    "@anthropic-ai/sdk",
    "openai",
    "qrcode",
    "qrcode.react",
    "twilio",
  ]) {
    assert.equal(
      pkg.dependencies?.[dep],
      undefined,
      `${dep} must not be added in Checkpoint 2`,
    );
  }
});

test("Sales action sendInvoice now routes through the Dev OS email helper", () => {
  const body = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/invoice-actions.ts"),
    "utf8",
  );
  assert.ok(
    body.includes("sendDevOsEmail"),
    "sendInvoice must use sendDevOsEmail",
  );
  assert.ok(
    body.includes("export async function generateInvoicePDF"),
    "generateInvoicePDF action must exist",
  );
});

test("AI Regenerate Draft action exists and persists drafts as pending", () => {
  const body = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/lead-actions.ts"),
    "utf8",
  );
  assert.ok(
    body.includes("export async function regenerateAIDraft"),
    "regenerateAIDraft must be exported",
  );
  assert.ok(
    body.includes("regenerateLeadWelcomeDraft"),
    "regenerateAIDraft must call the agent",
  );
  assert.ok(
    /reviewStatus:\s*"pending"/.test(body),
    "Regenerated drafts must persist as review_status='pending'",
  );
});
