/**
 * Sprint MD-2 + MD-3 — Photo evidence flows + inline AI grids.
 *
 * Source-inspection acceptance for:
 *   - Site report photo aggregator (loadSiteReportPhotos)
 *   - Operation task photo aggregator (loadOperationTaskPhotos)
 *   - Daily-digest output loader (loadDailyDigestOutputs)
 *   - Marketing-assistant draft loader (loadMarketingAssistantDrafts)
 *   - Site reports detail page consumes <PhotoEvidenceGrid>
 *   - Housekeeping apex feeds <PhotoEvidenceGrid> from real task photos
 *   - Site Supervisor apex renders inline daily-digest 3-card grid
 *   - Sales apex renders inline marketing-assistant 3-card grid
 *
 * Damage Reports detail page (MD-2.B) is intentionally NOT exercised
 * — the Dev OS damage-reports detail route does not exist; scope-cut
 * documented in the closure doc.
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

const SITE_PHOTO_QUERIES =
  "src/lib/development/server/site-reports/site-report-photo-queries.ts";
const TASK_PHOTO_QUERIES =
  "src/lib/development/server/operations/task-photo-queries.ts";
const DIGEST_QUERIES =
  "src/lib/development/server/ai/daily-digest-queries.ts";
const MARKETING_QUERIES =
  "src/lib/development/server/ai/marketing-assistant-queries.ts";

const SITE_REPORT_DETAIL =
  "src/app/(development-app)/development-os/site-reports/[id]/page.tsx";
const SITE_SUPERVISOR_APEX =
  "src/app/(development-app)/development-os/cabinets/site-supervisor/page.tsx";
const SALES_APEX =
  "src/app/(development-app)/development-os/cabinets/sales-manager/page.tsx";
const HOUSEKEEPING_APEX =
  "src/app/(dashboard)/dashboard/housekeeping/page.tsx";

// ============================================================================
// Task 1 — Photo aggregator queries
// ============================================================================

test("md-2 — loadSiteReportPhotos returns PhotoEvidenceItem-shaped rows", () => {
  assert.ok(exists(SITE_PHOTO_QUERIES));
  const src = read(SITE_PHOTO_QUERIES);
  assert.match(src, /export async function loadSiteReportPhotos/);
  assert.match(src, /from "@\/components\/award"/);
  // Joins site_report_photos to documents (polymorphic storage table).
  assert.match(src, /siteReportPhotos/);
  assert.match(src, /documents/);
  // Reuses the existing signed-URL helper (no new bucket code).
  assert.match(src, /getSiteReportPhotoUrl/);
  // Status mapping covers uploaded · failed · local.
  assert.match(src, /"uploaded"/);
  assert.match(src, /"failed"/);
  assert.match(src, /"local"/);
});

test("md-2 — loadOperationTaskPhotos reads task_attachments + resolves signed URLs", () => {
  assert.ok(exists(TASK_PHOTO_QUERIES));
  const src = read(TASK_PHOTO_QUERIES);
  assert.match(src, /export async function loadOperationTaskPhotos/);
  assert.match(src, /taskAttachments/);
  // Supabase admin client used for signed-URL issuance (1h TTL).
  assert.match(src, /getSupabaseAdmin/);
  assert.match(src, /createSignedUrl/);
  // Status mapping covers all 4 PhotoEvidence states.
  for (const s of ["uploaded", "failed", "local", "syncing"]) {
    assert.match(src, new RegExp(`"${s}"`));
  }
});

// ============================================================================
// Task 2 — MD-2.A site reports detail
// ============================================================================

test("md-2.A — site reports detail page mounts <PhotoEvidenceGrid> + loads photos via the aggregator", () => {
  const src = read(SITE_REPORT_DETAIL);
  assert.match(src, /<PhotoEvidenceGrid/);
  assert.match(src, /loadSiteReportPhotos/);
  // Grid section sits above the existing PhotoGallery section.
  const gridIdx = src.indexOf("<PhotoEvidenceGrid");
  const galleryIdx = src.indexOf("<PhotoGallery");
  assert.ok(gridIdx > 0 && galleryIdx > 0);
  assert.ok(
    gridIdx < galleryIdx,
    "PhotoEvidenceGrid should render above the legacy PhotoGallery",
  );
});

// ============================================================================
// Task 4 — MD-3.A daily-digest inline grid on Site Supervisor
// ============================================================================

test("md-3.A — daily-digest loader queries agent_outputs for both agent_key variants", () => {
  assert.ok(exists(DIGEST_QUERIES));
  const src = read(DIGEST_QUERIES);
  assert.match(src, /export async function loadDailyDigestOutputs/);
  // Both canonical agent keys are queried (drift across migrations).
  assert.match(src, /daily_construction_digest/);
  assert.match(src, /daily_digest/);
  // Returns up to 3 exception bullets from recommended_actions.
  assert.match(src, /latestExceptions/);
  assert.match(src, /recommendedActions/);
});

test("md-3.A — Site Supervisor apex renders inline 3-card grid + empty-state CTA", () => {
  const src = read(SITE_SUPERVISOR_APEX);
  assert.match(src, /loadDailyDigestOutputs/);
  // The Phase-1 placeholder badge is gone.
  assert.doesNotMatch(src, /Inline 3-card grid coming in a polish pass/);
  // Grid + empty-state branches present.
  assert.match(src, /digests\.length === 0/);
  assert.match(src, /digests\.map/);
  // "View digest" + "Run digest" CTAs live in the new markup.
  assert.match(src, /View digest/);
  assert.match(src, /Run digest/);
});

// ============================================================================
// Task 5 — MD-3.B marketing-assistant inline grid on Sales
// ============================================================================

test("md-3.B — marketing-assistant loader queries agent_outputs for marketing_assistant key", () => {
  assert.ok(exists(MARKETING_QUERIES));
  const src = read(MARKETING_QUERIES);
  assert.match(src, /export async function loadMarketingAssistantDrafts/);
  assert.match(src, /marketing_assistant/);
  // Channel inferred from detailed_output JSONB; falls back to draftType.
  assert.match(src, /pickChannel/);
  assert.match(src, /draftType/);
});

test("md-3.B — Sales apex renders inline 3-card draft grid + empty-state CTA", () => {
  const src = read(SALES_APEX);
  assert.match(src, /loadMarketingAssistantDrafts/);
  // Phase-2 placeholder badge is gone.
  assert.doesNotMatch(src, /Inline draft list coming in a polish pass/);
  // Grid + empty-state branches present.
  assert.match(src, /drafts\.length === 0/);
  assert.match(src, /drafts\.map/);
  // Open + Generate CTAs.
  assert.match(src, /Open draft/);
  assert.match(src, /Generate draft/);
});

// ============================================================================
// Task 6 — MD-2.C housekeeping photo grid
// ============================================================================

test("md-2.C — Housekeeping apex feeds <PhotoEvidenceGrid> from loadOperationTaskPhotos", () => {
  const src = read(HOUSEKEEPING_APEX);
  assert.match(src, /loadOperationTaskPhotos/);
  assert.match(src, /todayTaskIds/);
  // Empty-state copy no longer claims aggregation is "coming in a follow-up".
  assert.doesNotMatch(
    src,
    /Photo aggregation coming in a follow-up/,
  );
  assert.match(src, /<PhotoEvidenceGrid/);
});
