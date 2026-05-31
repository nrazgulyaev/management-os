/**
 * OWNER-PORTAL-SEED-1 — idempotent demo data for GRANTED owners.
 *
 * The owner portal renders blank for most owners because `owner_insights` and
 * `villa_photos` are empty. This seeds, for every owner who has an ACTIVE
 * `owner_portal` grant (app_users_owners):
 *   - 2-3 owner_insights rows (tagged payload.seed = "OWNER-PORTAL-SEED-1")
 *   - one `hero` villa_photo per owned villa that has no hero photo yet
 *
 * Idempotent: re-running inserts nothing new. Insights are skipped when a
 * seeded marker row already exists for the owner; hero photos are skipped when
 * the villa already has any `hero` photo (so we never clobber real uploads).
 *
 * Run: npm run seed:owner-portal-demo
 *   (node --env-file-if-exists=.env.production.local --import tsx scripts/seed-owner-portal-demo.ts)
 */
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const SEED_MARKER = "OWNER-PORTAL-SEED-1";

/**
 * Correct accessor for postgres-js `db.execute()` (returns an Array, not
 * `{ rows }`). Mirrors `rowsOf` from @/lib/db/client; inlined to avoid pulling
 * the app DB-client module (and its `@/` alias) into a plain tsx script.
 */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

interface GrantedOwner {
  id: string;
  name: string | null;
}

/** Demo insights per owner. payload is opaque jsonb consumed by the portal UI. */
function demoInsights(ownerName: string) {
  const who = ownerName || "owner";
  return [
    {
      kind: "occupancy_trend",
      level: "info",
      payload: {
        seed: SEED_MARKER,
        metric: "occupancy",
        window: "last_30d",
        value_pct: 82,
        delta_pct: 6,
        summary: `Occupancy up 6% vs the prior month across ${who}'s villas.`,
        action: "No action needed — momentum is healthy.",
      },
    },
    {
      kind: "adr_trend",
      level: "watch",
      payload: {
        seed: SEED_MARKER,
        metric: "adr",
        window: "last_30d",
        value_usd: 412,
        delta_pct: -3,
        summary: "Average daily rate softened 3% as shoulder season begins.",
        action: "Consider a 2-night minimum promo to defend ADR.",
      },
    },
    {
      kind: "guest_satisfaction",
      level: "info",
      payload: {
        seed: SEED_MARKER,
        metric: "review_score",
        window: "last_90d",
        value: 4.8,
        scale: 5,
        summary: "Guest review average holding at 4.8/5.",
        action: "Share the latest five-star reviews on your listing.",
      },
    },
  ];
}

async function main() {
  const db = getDb();
  let insightsInserted = 0;
  let ownersSeeded = 0;
  let ownersSkipped = 0;
  let photosInserted = 0;
  let villasSeen = 0;

  try {
    const owners = rowsOf<GrantedOwner>(
      await db.execute(sql`
        SELECT DISTINCT o.id::text AS id, o.display_name AS name
          FROM owners o
          JOIN app_users_owners auo ON auo.owner_id = o.id
         WHERE auo.grant_type = 'owner_portal'
           AND auo.status = 'active'
         ORDER BY o.display_name
      `),
    );

    console.log(`[${SEED_MARKER}] granted owners found: ${owners.length}`);

    // Sequential — no DB fan-out (keeps to a single pooled connection).
    for (const owner of owners) {
      // ── owner_insights (idempotent via seed marker) ──
      const existing = rowsOf<{ c: number }>(
        await db.execute(sql`
          SELECT count(*)::int AS c FROM owner_insights
           WHERE owner_id = ${owner.id}::uuid
             AND payload->>'seed' = ${SEED_MARKER}
        `),
      );
      if ((existing[0]?.c ?? 0) === 0) {
        for (const ins of demoInsights(owner.name ?? "")) {
          await db.execute(sql`
            INSERT INTO owner_insights (owner_id, kind, level, payload)
            VALUES (${owner.id}::uuid, ${ins.kind}, ${ins.level}, ${JSON.stringify(ins.payload)}::jsonb)
          `);
          insightsInserted++;
        }
        ownersSeeded++;
      } else {
        ownersSkipped++;
      }

      // ── villa_photos hero per owned villa (idempotent: skip if hero exists) ──
      const villas = rowsOf<{ id: string }>(
        await db.execute(sql`
          SELECT DISTINCT v.id::text AS id
            FROM ownership_shares os
            JOIN villas v ON v.id = os.villa_id
           WHERE os.owner_id = ${owner.id}::uuid
             AND os.status = 'active'
        `),
      );
      for (const villa of villas) {
        villasSeen++;
        const hasHero = rowsOf<{ c: number }>(
          await db.execute(sql`
            SELECT count(*)::int AS c FROM villa_photos
             WHERE villa_id = ${villa.id}::uuid AND kind = 'hero'
          `),
        );
        if ((hasHero[0]?.c ?? 0) === 0) {
          // Deterministic demo image (stable per villa → idempotent URL).
          const url = `https://picsum.photos/seed/${villa.id}/1600/900`;
          await db.execute(sql`
            INSERT INTO villa_photos (villa_id, url, caption, kind, position, width, height, visible_to_owner)
            VALUES (${villa.id}::uuid, ${url}, ${"Villa hero (demo)"}, 'hero', 0, 1600, 900, true)
          `);
          photosInserted++;
        }
      }
    }

    console.log(
      `[${SEED_MARKER}] done — owners seeded: ${ownersSeeded}, skipped (already seeded): ${ownersSkipped}; ` +
        `insights inserted: ${insightsInserted}; villas seen: ${villasSeen}, hero photos inserted: ${photosInserted}`,
    );
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(`[${SEED_MARKER}] FAILED:`, err);
  process.exit(1);
});
