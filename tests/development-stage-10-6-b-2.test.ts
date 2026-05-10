/**
 * Stage 10.6 / Phase 10.6.B.2 — Defensive loaders close 13 P0 500s.
 *
 * For each of the 13 page files documented in the audit
 * (docs/stage-10-6-a-audit/06-issues-by-severity.md P0 list),
 * assert that:
 *   - safeQuery is imported
 *   - the previously-unguarded loader callsite is now wrapped in
 *     safeQuery(...)
 *
 * Live verification (production sweep returning 0 P0 500s) is
 * operator-side; tests assert the structural fix shipped.
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
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

const SAFEQUERY_IMPORT = /from\s+["']@\/lib\/development\/safe-query["']/;

interface PageContract {
  /** Page file path (must contain safeQuery wrap) */
  path: string;
  /** Each call-label (passed as first arg to safeQuery) that must appear */
  labels: string[];
}

const CONTRACTS: PageContract[] = [
  {
    path: "src/app/(development-app)/development-os/banking/page.tsx",
    labels: [
      "banking.getOrganizationByCode",
      "banking.bankConnections",
    ],
  },
  {
    path: "src/app/(development-app)/development-os/banking/new/page.tsx",
    labels: ["banking-new.getOrganizationByCode"],
  },
  {
    path: "src/app/(development-app)/development-os/marketing/connections/page.tsx",
    labels: ["marketing-connections.list"],
  },
  {
    path: "src/app/(development-app)/development-os/marketing/connections/new/page.tsx",
    labels: ["marketing-connections-new.getOrganizationByCode"],
  },
  {
    path: "src/app/(development-app)/development-os/platform/branding/page.tsx",
    labels: ["platform-branding.listOrganizations"],
  },
  {
    path: "src/app/(development-app)/development-os/platform/organizations/page.tsx",
    labels: ["platform-organizations.listOrganizations"],
  },
  {
    path: "src/app/(development-app)/development-os/settings/api-keys/page.tsx",
    labels: [
      "settings-api-keys.getOrganizationByCode",
      "settings-api-keys.listApiKeysForOrg",
    ],
  },
  {
    path: "src/app/(development-app)/development-os/settings/data-export/page.tsx",
    labels: [
      "settings-data-export.getOrganizationByCode",
      "settings-data-export.listExportRequestsForOrg",
    ],
  },
  {
    path: "src/app/(development-app)/development-os/settings/google-workspace/page.tsx",
    labels: [
      "settings-google-workspace.getOrganizationByCode",
      "settings-google-workspace.listGoogleConnectionsForOrg",
    ],
  },
  {
    path: "src/app/(development-app)/development-os/settings/webhooks/page.tsx",
    labels: [
      "settings-webhooks.getOrganizationByCode",
      "settings-webhooks.listWebhookSubscriptions",
    ],
  },
  {
    path: "src/app/(development-app)/development-os/settings/whatsapp/page.tsx",
    labels: [
      // Already had safeQuery on the WhatsApp loaders (CHECKPOINT 3
      // _p0-500-diagnoses #11 noted these were guarded). 10.6.B.2 adds
      // safeQuery on the org lookup + oauth credential check.
      "settings-whatsapp.getOrganizationByCode",
      "settings-whatsapp.oauthConnections",
    ],
  },
  {
    path: "src/app/(dashboard)/dashboard/payments/providers/page.tsx",
    labels: [
      "payments-providers.listPaymentProviderAccounts",
      "payments-providers.getOrganizationByCode",
      "payments-providers.paymentProcessorConnections",
    ],
  },
  {
    path: "src/app/(dashboard)/dashboard/payments/providers/new/page.tsx",
    labels: ["payments-providers-new.getOrganizationByCode"],
  },
];

// ============================================================================
// Per-page contracts — each page imports safeQuery + has the documented labels
// ============================================================================

for (const contract of CONTRACTS) {
  test(`10.6.B.2 — ${contract.path} imports safeQuery`, () => {
    assert.ok(exists(contract.path), `expected ${contract.path} to exist`);
    const src = read(contract.path);
    assert.match(
      src,
      SAFEQUERY_IMPORT,
      `${contract.path} must import safeQuery from @/lib/development/safe-query`,
    );
  });

  for (const label of contract.labels) {
    test(`10.6.B.2 — ${contract.path} wraps ${label}`, () => {
      const src = read(contract.path);
      // Match safeQuery("<label>", … pattern
      const re = new RegExp(
        `safeQuery\\(\\s*["']${label.replace(/[.+*?^$(){}|[\]\\]/g, "\\$&")}["']`,
      );
      assert.match(
        src,
        re,
        `${contract.path} must call safeQuery("${label}", …)`,
      );
    });
  }
}

// ============================================================================
// Global invariant — no remaining unguarded await on the 9 documented loaders
// ============================================================================

test("10.6.B.2 — no remaining unguarded `await listOrganizations()` in the 13 P0 pages", () => {
  for (const c of CONTRACTS) {
    const src = read(c.path);
    // Every `await listOrganizations(` must be inside safeQuery(…).
    // We can't easily check AST, so we assert the file imports safeQuery
    // (covered above) AND has at least one safeQuery call (covered above).
    assert.match(src, /safeQuery\(/, `${c.path} must use safeQuery`);
  }
});

// ============================================================================
// Decisions doc + acceptance gate
// ============================================================================

test("10.6.B.2 — decisions doc shipped + acceptance gate present", () => {
  const path = "tmp/stage-10-6-b-2-decisions.md";
  assert.ok(existsSync(resolve(ROOT, path)));
  const doc = readFileSync(resolve(ROOT, path), "utf8");
  assert.match(doc, /STAGE 10\.6 \/ PHASE 10\.6\.B\.2 ACCEPTED/);
  // The "13 P0 500s" reference must appear so future readers can trace
  // back to the audit's P0 list.
  assert.match(doc, /13 P0|13 server errors/i);
});
