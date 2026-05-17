#!/usr/bin/env tsx
/**
 * DEMO-3 — Arconique demo seed, part 3. NEVER FOR PRODUCTION USE.
 *
 * Seeds entities that DEMO-1/2 deferred:
 *   - voice_notes               30 records linked to existing site_reports
 *   - qa_qc_issues + inspections 20 issues with 1-2 inspections each
 *   - safety_incidents          7 incidents
 *   - investor_nav_snapshots    24 (4 projects × 6 quarters)
 *
 * Per Phase A audit scope is narrowed:
 *   - documents / site_report_photos      → STORAGE-1 (needs Supabase bucket)
 *   - investor commitments / drawdowns    → INVESTOR-1 (complex FK chain)
 *   - rate_plans                          → BOOKING-PRICING-1 (needs RB1 design)
 *   - channel_sync_state                  → CHANNEL-1 (no state table yet)
 *   - owner_stay_quotas                   → existing owner_stay_policies covers this
 *
 * Idempotent via DEMO3- prefix on code columns + --wipe flag.
 *
 *   npm run seed:demo-3
 *   npm run seed:demo-3 -- --wipe
 *   npm run seed:demo-3 -- --org=<uuid>
 */

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";

interface Args {
  wipe: boolean;
  orgId: string;
}

function parseArgs(argv: string[]): Args {
  const a = argv.slice(2);
  const orgArg = a.find((x) => x.startsWith("--org="));
  return {
    wipe: a.includes("--wipe"),
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

function pickDet<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------

async function wipe(db: ReturnType<typeof getDb>, orgId: string): Promise<void> {
  console.log("wiping DEMO3- prefixed rows for org", orgId);
  const a = await db.execute(sql`DELETE FROM voice_notes WHERE notes LIKE 'DEMO3%' AND organization_id = ${orgId}::uuid`);
  console.log("  voice_notes deleted:", (a as unknown as { count?: number }).count ?? "?");
  const b = await db.execute(sql`
    DELETE FROM qa_qc_inspections
     WHERE issue_id IN (
       SELECT id FROM qa_qc_issues WHERE issue_code LIKE 'DEMO3-%' AND organization_id = ${orgId}::uuid
     )
  `);
  console.log("  qa_qc_inspections deleted:", (b as unknown as { count?: number }).count ?? "?");
  const c = await db.execute(sql`
    DELETE FROM qa_qc_issues WHERE issue_code LIKE 'DEMO3-%' AND organization_id = ${orgId}::uuid
  `);
  console.log("  qa_qc_issues deleted:", (c as unknown as { count?: number }).count ?? "?");
  const d = await db.execute(sql`DELETE FROM safety_incidents WHERE incident_code LIKE 'DEMO3-%'`);
  console.log("  safety_incidents deleted:", (d as unknown as { count?: number }).count ?? "?");
  const e = await db.execute(sql`
    DELETE FROM investor_nav_snapshots
     WHERE snapshot_notes LIKE 'DEMO3%' AND organization_id = ${orgId}::uuid
  `);
  console.log("  investor_nav_snapshots deleted:", (e as unknown as { count?: number }).count ?? "?");
}

// -----------------------------------------------------------------------------

async function seedVoiceNotes(db: ReturnType<typeof getDb>, orgId: string): Promise<number> {
  console.log("seeding voice_notes...");
  const reports = asRows<{ id: string; project_id: string }>(await db.execute(sql`
    SELECT id::text AS id, project_id::text AS project_id
      FROM site_reports
     WHERE organization_id = ${orgId}::uuid
     ORDER BY report_date DESC
     LIMIT 15
  `));
  if (reports.length === 0) {
    console.log("  no site_reports — skip");
    return 0;
  }
  const user = asRows<{ id: string }>(await db.execute(sql`
    SELECT id::text FROM app_users WHERE organization_id = ${orgId}::uuid LIMIT 1
  `))[0];

  const transcripts = [
    { lang: "id", text: "Pengiriman semen 50 sak datang jam 7 pagi. Diturunkan di area Block B." },
    { lang: "en", text: "Block A column pour completed at 09:30. Cube samples taken." },
    { lang: "id", text: "Kontraktor MEP minta clarification untuk diagram listrik level 2." },
    { lang: "en", text: "Marble tile delivery delayed — vendor confirms reissue Friday." },
    { lang: "id", text: "Tukang kayu mulai pemasangan pintu utama villa 3." },
    { lang: "en", text: "Pool filter pressure within normal range after backwash this morning." },
    { lang: "id", text: "Listrik PLN di area Block A diputus 15 menit untuk perbaikan." },
    { lang: "en", text: "Site supervisor walk-through complete; 4 minor finishing items flagged." },
  ];
  let n = 0;
  for (let i = 0; i < 30; i++) {
    const report = reports[i % reports.length];
    const t = pickDet(transcripts, i);
    await db.execute(sql`
      INSERT INTO voice_notes (
        organization_id, site_report_id, project_id, recorded_by,
        audio_url, duration_seconds, transcript_text, transcript_language,
        transcribed_by_ai, notes
      ) VALUES (
        ${orgId}::uuid, ${report.id}::uuid, ${report.project_id}::uuid,
        ${user?.id ?? null},
        ${`/placeholder/voice/demo3-vn-${String(i + 1).padStart(3, "0")}.mp3`},
        ${30 + (i * 13) % 150},
        ${t.text},
        ${t.lang},
        ${true},
        ${`DEMO3 voice note ${i + 1}`}
      )
    `);
    n++;
  }
  console.log(`  ${n} voice notes`);
  return n;
}

async function seedQaQc(db: ReturnType<typeof getDb>, orgId: string): Promise<number> {
  console.log("seeding qa_qc_issues + inspections...");
  const projects = asRows<{ id: string }>(await db.execute(sql`
    SELECT DISTINCT p.id::text AS id
      FROM projects p
      JOIN villas v ON v.project_id = p.id
      JOIN ownership_shares os ON os.villa_id = v.id
     WHERE os.status = 'active'
     LIMIT 6
  `));
  if (projects.length === 0) {
    console.log("  no projects — skip");
    return 0;
  }
  const villas = asRows<{ id: string; project_id: string }>(await db.execute(sql`
    SELECT id::text, project_id::text FROM villas WHERE status NOT IN ('archived','out_of_service') LIMIT 12
  `));
  const cats = asRows<{ id: string }>(await db.execute(sql`
    SELECT id::text FROM qa_qc_categories WHERE is_active = true LIMIT 6
  `));
  if (cats.length === 0) {
    console.log("  no qa_qc_categories — skip");
    return 0;
  }
  const user = asRows<{ id: string }>(await db.execute(sql`
    SELECT id::text FROM app_users WHERE organization_id = ${orgId}::uuid LIMIT 1
  `))[0];
  if (!user) {
    console.log("  no app_user (qa_qc_issues.reported_by NOT NULL) — skip");
    return 0;
  }

  const titles = [
    "Tile alignment off in master bath",
    "Marble slab edge chip detected",
    "AC condensate line not insulated",
    "Door frame paint touch-up needed",
    "Pool deck grout missing 3 segments",
    "MEP wall plate misaligned",
    "Cabinet hinge alignment",
    "Window seal incomplete on north face",
    "Pool tile colour mismatch (1 panel)",
    "Stair tread depth varies by 4mm",
    "Driveway pavement settling crack",
    "Bedroom skirting board gap",
    "Lighting switch label missing",
    "Bath drain slope insufficient",
    "Roof eave finish rough",
    "Garage door alignment off-axis",
    "Kitchen tap pressure low",
    "Plug socket cover loose",
    "Garden retaining wall hairline",
    "Smart-lock keypad backlight dim",
  ];
  const severities = ["low", "medium", "high", "critical"] as const;
  const statuses = ["closed", "closed", "ready_for_reinspection", "in_progress", "open"] as const;

  let nIssues = 0;
  let nInspections = 0;
  for (let i = 0; i < 20; i++) {
    const villa = villas[i % villas.length];
    const issueCode = `DEMO3-QA-${String(i + 1).padStart(4, "0")}`;
    const existing = asRows<{ id: string }>(await db.execute(sql`
      SELECT id::text FROM qa_qc_issues WHERE issue_code = ${issueCode} LIMIT 1
    `));
    let issueId = existing[0]?.id;
    if (!issueId) {
      const sev = severities[i % severities.length];
      const status = statuses[i % statuses.length];
      const inserted = asRows<{ id: string }>(await db.execute(sql`
        INSERT INTO qa_qc_issues (
          organization_id, issue_code, title, project_id, villa_id,
          category_id, severity, description, reported_by, status, reported_at
        ) VALUES (
          ${orgId}::uuid, ${issueCode}, ${titles[i]}, ${villa.project_id}::uuid, ${villa.id}::uuid,
          ${cats[i % cats.length].id}::uuid, ${sev},
          ${`Identified during routine site walk-through. ${titles[i]}.`},
          ${user.id}::uuid, ${status},
          NOW() - (${i * 2} || ' days')::interval
        )
        RETURNING id::text
      `));
      issueId = inserted[0]?.id;
      if (!issueId) continue;
      nIssues++;
    }
    // 1-2 inspections per issue
    const inspectionCount = (i % 3 === 0) ? 2 : 1;
    for (let k = 1; k <= inspectionCount; k++) {
      const result = k === inspectionCount ? "passed" : "partial_pass";
      try {
        await db.execute(sql`
          INSERT INTO qa_qc_inspections (
            organization_id, issue_id, inspection_number, inspector_id,
            inspection_date, result, result_notes
          ) VALUES (
            ${orgId}::uuid, ${issueId}::uuid, ${k}, ${user.id}::uuid,
            ${isoDate(new Date(Date.now() - i * 2 * 86400000))},
            ${result},
            ${k === inspectionCount ? "Re-inspected after correction; pass." : "Initial review; rework requested."}
          )
          ON CONFLICT DO NOTHING
        `);
        nInspections++;
      } catch (e) {
        // unique violation on (issue_id, inspection_number) — skip
        if (!/unique|duplicate/i.test((e as Error).message)) throw e;
      }
    }
  }
  console.log(`  ${nIssues} issues + ${nInspections} inspections`);
  return nInspections;
}

async function seedSafetyIncidents(db: ReturnType<typeof getDb>, orgId: string): Promise<number> {
  console.log("seeding safety_incidents...");
  const projects = asRows<{ id: string }>(await db.execute(sql`
    SELECT id::text FROM projects WHERE status IN ('active','under_construction','managed') LIMIT 4
  `));
  if (projects.length === 0) {
    console.log("  no projects — skip");
    return 0;
  }
  const incidents = [
    { sev: "near_miss", cat: "fall", desc: "Worker slipped near unsecured scaffold edge; no injury. Edge protection reinstalled immediately." },
    { sev: "near_miss", cat: "material_handling", desc: "Steel rebar bundle nearly fell from elevated platform; banding inspected, lift protocol reviewed." },
    { sev: "minor", cat: "equipment", desc: "Hand laceration during cutting; first-aid applied, worker returned to duty next day." },
    { sev: "near_miss", cat: "electrical", desc: "Temporary cable found exposed in standing water; isolated and re-routed." },
    { sev: "minor", cat: "fall", desc: "Slip on wet floor during cleanup; bruise reported." },
    { sev: "near_miss", cat: "vehicle", desc: "Reversing truck close-call with foreman; mirror adjustment + spotter procedure clarified." },
    { sev: "near_miss", cat: "weather", desc: "Lightning observed nearby; site evacuated per protocol, no injuries." },
  ];
  let n = 0;
  for (let i = 0; i < incidents.length; i++) {
    const code = `DEMO3-SAF-${String(i + 1).padStart(4, "0")}`;
    const existing = asRows<{ id: string }>(await db.execute(sql`
      SELECT id::text FROM safety_incidents WHERE incident_code = ${code} LIMIT 1
    `));
    if (existing[0]) continue;
    const project = projects[i % projects.length];
    const status = i < 5 ? "closed" : "open";
    await db.execute(sql`
      INSERT INTO safety_incidents (
        organization_id, incident_code, project_id, incident_date, severity, category,
        description, status, affected_workers_count
      ) VALUES (
        ${orgId}::uuid, ${code}, ${project.id}::uuid,
        ${isoDate(new Date(Date.now() - i * 6 * 86400000))},
        ${incidents[i].sev}, ${incidents[i].cat},
        ${incidents[i].desc}, ${status},
        ${incidents[i].sev === "minor" ? 1 : 0}
      )
    `);
    n++;
  }
  console.log(`  ${n} incidents`);
  return n;
}

async function seedNavSnapshots(db: ReturnType<typeof getDb>, orgId: string): Promise<number> {
  console.log("seeding investor_nav_snapshots...");
  const projects = asRows<{ id: string; name: string }>(await db.execute(sql`
    SELECT p.id::text AS id, p.name AS name
      FROM projects p
     WHERE p.status IN ('active','under_construction','managed','planning')
       AND p.slug LIKE 'demo-%'
     LIMIT 4
  `));
  if (projects.length === 0) {
    console.log("  no projects — skip");
    return 0;
  }
  // 6 quarter-ends, starting 6 quarters ago.
  const today = new Date();
  const quarterEnds: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const month = today.getUTCMonth() - i * 3;
    const d = new Date(Date.UTC(today.getUTCFullYear(), month + 1, 0)); // last day of that month
    quarterEnds.push(isoDate(d));
  }
  let n = 0;
  for (const p of projects) {
    let nav = 1_500_000_00 + Math.floor(Math.random() * 2_000_000_00); // $1.5M-$3.5M initial
    for (const q of quarterEnds) {
      const existing = asRows<{ id: string }>(await db.execute(sql`
        SELECT id::text FROM investor_nav_snapshots
         WHERE project_id = ${p.id}::uuid AND quarter_end_date = ${q}::date
         LIMIT 1
      `));
      if (existing[0]) continue;
      await db.execute(sql`
        INSERT INTO investor_nav_snapshots (
          organization_id, project_id, quarter_end_date,
          nav_total_minor, currency, snapshot_notes
        ) VALUES (
          ${orgId}::uuid, ${p.id}::uuid, ${q}::date,
          ${nav.toString()}::bigint, ${"USD"},
          ${`DEMO3 NAV snapshot for quarter ending ${q}`}
        )
      `);
      nav = Math.round(nav * (1.02 + Math.random() * 0.04)); // 2-6% quarterly growth
      n++;
    }
  }
  console.log(`  ${n} NAV snapshots across ${projects.length} projects`);
  return n;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const db = getDb();
  try {
    console.log("target org:", args.orgId);
    if (args.wipe) await wipe(db, args.orgId);
    const v = await seedVoiceNotes(db, args.orgId);
    const q = await seedQaQc(db, args.orgId);
    const s = await seedSafetyIncidents(db, args.orgId);
    const n = await seedNavSnapshots(db, args.orgId);
    console.log(`\ndone. voice=${v} qa=${q} safety=${s} nav=${n}`);
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
