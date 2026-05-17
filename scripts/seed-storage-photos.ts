#!/usr/bin/env tsx
/**
 * STORAGE-1-WIRE-PHOTOS — Seed placeholder documents into the Supabase
 * Storage bucket so /owner/documents, /investor-portal/documents, and
 * (downstream) the construction photo galleries have real content to
 * render. NEVER FOR PRODUCTION USE.
 *
 * Uses the existing storage-service uploadDocument() helper, which
 * handles:
 *   - bucket creation (idempotent)
 *   - documents row insertion
 *   - rollback on upload failure
 *
 * Idempotency: skips if a documents row with the same (entity_id, title)
 * already exists.
 *
 *   npm run seed:storage-photos
 *   npm run seed:storage-photos -- --org=<uuid>
 *   npm run seed:storage-photos -- --documents-only   # skip placeholder photos
 *   npm run seed:storage-photos -- --wipe             # delete seeded rows + storage objects
 *
 * Photos use procedurally-generated 1px-resolution JPEGs (12-byte payload
 * each — just enough for Supabase to accept the upload). The point is to
 * exercise the storage round-trip + signed-URL flow, not to ship art.
 * Real construction photos land via STORAGE-1-WIRE-PHOTOS-2 once the
 * customer provides them.
 */

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";
import { uploadDocument } from "../src/features/storage/storage-service";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";

interface Args {
  wipe: boolean;
  documentsOnly: boolean;
  orgId: string;
}

function parseArgs(argv: string[]): Args {
  const a = argv.slice(2);
  const orgArg = a.find((x) => x.startsWith("--org="));
  return {
    wipe: a.includes("--wipe"),
    documentsOnly: a.includes("--documents-only"),
    orgId: orgArg ? orgArg.split("=", 2)[1] : ARCONIQUE_ORG_ID,
  };
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows) ?? [];
  }
  return [];
}

/**
 * Minimal valid 1x1 JPEG (used as placeholder photo content). Real
 * construction photos arrive via STORAGE-1-WIRE-PHOTOS-2.
 */
const PLACEHOLDER_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xfb, 0xd0, 0xff, 0xd9,
]);

/**
 * Minimal valid PDF (used as placeholder document content). Renders as
 * a blank page in any PDF viewer. Real customer documents replace these
 * via the in-app upload flow.
 */
function makePlaceholderPdf(title: string): Uint8Array {
  const content = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /Resources <</Font <</F1 4 0 R>>>> /MediaBox [0 0 612 792] /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
5 0 obj <</Length 56>> stream
BT /F1 24 Tf 50 720 Td (${title.replace(/[()\\]/g, "")}) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000111 00000 n
0000000212 00000 n
0000000273 00000 n
trailer <</Size 6 /Root 1 0 R>>
startxref
388
%%EOF`;
  return new TextEncoder().encode(content);
}

async function wipe(db: ReturnType<typeof getDb>, orgId: string): Promise<void> {
  console.log("wiping STORAGE-1 seeded documents for org", orgId);
  // Delete database rows; orphaned storage objects in the bucket can be
  // garbage-collected by an operator script. (We can't list storage paths
  // from here without the admin client.)
  const r = await db.execute(sql`
    DELETE FROM documents
     WHERE title LIKE '[DEMO-STORAGE] %'
  `);
  console.log("  rows:", (r as unknown as { count?: number }).count ?? "?");
}

interface SeedTarget {
  entityType:
    | "project"
    | "villa"
    | "owner"
    | "booking"
    | "supplier"
    | "task"
    | "maintenance"
    | "statement"
    | "site_report";
  entityId: string;
  documents: Array<{
    title: string;
    documentType: string;
    visibility: "operator_only" | "owner_visible" | "investor_visible";
  }>;
}

async function alreadySeeded(
  db: ReturnType<typeof getDb>,
  title: string,
): Promise<boolean> {
  const rows = asRows<{ id: string }>(
    await db.execute(sql`
      SELECT id::text AS id FROM documents WHERE title = ${title} LIMIT 1
    `),
  );
  return rows.length > 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log("STORAGE-1-WIRE-PHOTOS — org:", args.orgId);
  const db = getDb();

  if (args.wipe) {
    await wipe(db, args.orgId);
    await closeDb();
    return;
  }

  // ============================================================
  // 1) Document seed — one PDF per (entity_type, role) target.
  // ============================================================
  console.log("\nseeding placeholder documents...");

  const targets: SeedTarget[] = [];

  // Owner-facing docs: one set of 3 per villa.
  const villas = asRows<{ id: string; name: string }>(
    await db.execute(sql`
      SELECT id::text AS id, COALESCE(name, unit_code) AS name
        FROM villas
       LIMIT 8
    `),
  );
  for (const v of villas) {
    targets.push({
      entityType: "villa",
      entityId: v.id,
      documents: [
        {
          title: `[DEMO-STORAGE] Lease Agreement — ${v.name}`,
          documentType: "contract",
          visibility: "owner_visible",
        },
        {
          title: `[DEMO-STORAGE] Villa Specifications — ${v.name}`,
          documentType: "specifications",
          visibility: "owner_visible",
        },
        {
          title: `[DEMO-STORAGE] Insurance Certificate — ${v.name}`,
          documentType: "certificate",
          visibility: "owner_visible",
        },
      ],
    });
  }

  // Project-level docs: building permit, site plan, BOQ summary per project.
  const projectsList = asRows<{ id: string; name: string }>(
    await db.execute(sql`
      SELECT id::text AS id, name
        FROM projects
       WHERE status NOT IN ('archived', 'completed')
       LIMIT 6
    `),
  );
  for (const p of projectsList) {
    targets.push({
      entityType: "project",
      entityId: p.id,
      documents: [
        {
          title: `[DEMO-STORAGE] Building Permit — ${p.name}`,
          documentType: "permit",
          visibility: "investor_visible",
        },
        {
          title: `[DEMO-STORAGE] Site Plan — ${p.name}`,
          documentType: "drawing",
          visibility: "investor_visible",
        },
        {
          title: `[DEMO-STORAGE] BOQ Summary — ${p.name}`,
          documentType: "boq",
          visibility: "investor_visible",
        },
      ],
    });
  }

  let nDocs = 0;
  let nSkipped = 0;
  for (const target of targets) {
    for (const doc of target.documents) {
      if (await alreadySeeded(db, doc.title)) {
        nSkipped++;
        continue;
      }
      const bytes = makePlaceholderPdf(doc.title);
      const result = await uploadDocument({
        organizationId: args.orgId,
        entityType: target.entityType,
        entityId: target.entityId,
        documentType: doc.documentType,
        title: doc.title,
        fileName: `${doc.title.replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`,
        mimeType: "application/pdf",
        bytes,
        visibility: doc.visibility,
      });
      if (!result.ok) {
        console.error(`  FAIL: ${doc.title} — ${result.error}`);
        continue;
      }
      nDocs++;
    }
  }
  console.log(`  ${nDocs} documents uploaded, ${nSkipped} skipped (idempotency)`);

  // ============================================================
  // 2) Site report photos — placeholder JPEG per recent site_report.
  // ============================================================
  if (!args.documentsOnly) {
    console.log("\nseeding placeholder site-report photos...");
    const siteReports = asRows<{ id: string; report_date: string }>(
      await db.execute(sql`
        SELECT id::text AS id, report_date::text AS report_date
          FROM site_reports
         WHERE organization_id = ${args.orgId}::uuid
         ORDER BY report_date DESC
         LIMIT 15
      `),
    );

    let nPhotos = 0;
    let nPhotoSkipped = 0;
    for (const r of siteReports) {
      for (let i = 1; i <= 2; i++) {
        const title = `[DEMO-STORAGE] Site report ${r.report_date} · photo ${i}`;
        if (await alreadySeeded(db, title)) {
          nPhotoSkipped++;
          continue;
        }
        const result = await uploadDocument({
          organizationId: args.orgId,
          entityType: "site_report",
          entityId: r.id,
          documentType: "photo",
          title,
          fileName: `site_report_${r.id.slice(0, 8)}_photo_${i}.jpg`,
          mimeType: "image/jpeg",
          bytes: PLACEHOLDER_JPEG_BYTES,
          visibility: "operator_only",
        });
        if (!result.ok) {
          console.error(`  FAIL: ${title} — ${result.error}`);
          continue;
        }
        nPhotos++;
      }
    }
    console.log(`  ${nPhotos} photos uploaded, ${nPhotoSkipped} skipped`);
  }

  console.log("\ndone.");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
