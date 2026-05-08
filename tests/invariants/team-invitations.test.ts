/**
 * Stage 9.D — DB-bound invariants for team_invitations.
 *
 * Skipped when no `DATABASE_URL` is configured (static-only CI lane).
 * Run against staging or production manually:
 *
 *   node --env-file=.env.production.local --import tsx \
 *     --test tests/invariants/team-invitations.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

const DB_AVAILABLE = Boolean(process.env.DATABASE_URL);

interface RowList<T> {
  rows?: T[];
}

async function rawSelect<T = Record<string, unknown>>(
  query: ReturnType<typeof sql>,
): Promise<T[]> {
  const { getDb } = (await import("@/lib/db/client")) as {
    getDb: () => { execute: (q: ReturnType<typeof sql>) => Promise<unknown> } | null;
  };
  const db = getDb();
  if (!db) return [];
  const r = await db.execute(query);
  if (Array.isArray(r)) return r as T[];
  return ((r as RowList<T>).rows ?? []) as T[];
}

test(
  "team_invitations table exists with the migration's expected shape",
  { skip: !DB_AVAILABLE },
  async () => {
    const cols = await rawSelect<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'team_invitations'`,
    );
    const set = new Set(cols.map((c) => c.column_name));
    for (const required of [
      "id",
      "organization_id",
      "email",
      "role_key",
      "scope",
      "token",
      "status",
      "expires_at",
      "invited_by_user_id",
    ]) {
      assert.ok(set.has(required), `team_invitations is missing column ${required}`);
    }
  },
);

test(
  "every pending invitation has expires_at in the future",
  { skip: !DB_AVAILABLE },
  async () => {
    const stale = await rawSelect<{ id: string; email: string }>(
      sql`SELECT id, email FROM public.team_invitations
           WHERE status = 'pending' AND expires_at <= now()`,
    );
    assert.deepStrictEqual(
      stale,
      [],
      `${stale.length} pending invitations have already expired — the cron / accept flow should have flipped them to 'expired'`,
    );
  },
);

test(
  "no two pending invitations exist for the same (org, email)",
  { skip: !DB_AVAILABLE },
  async () => {
    // The partial unique index enforces this at insert time. The check
    // here proves the index is intact.
    const dupes = await rawSelect<{
      organization_id: string;
      email: string;
      n: number | string;
    }>(
      sql`SELECT organization_id, lower(email) AS email, count(*) AS n
            FROM public.team_invitations
           WHERE status = 'pending'
           GROUP BY organization_id, lower(email)
          HAVING count(*) > 1`,
    );
    assert.deepStrictEqual(
      dupes,
      [],
      `${dupes.length} (org, email) pairs have multiple pending invitations`,
    );
  },
);

test(
  "every accepted invitation references an existing app_users row",
  { skip: !DB_AVAILABLE },
  async () => {
    const orphans = await rawSelect<{ id: string; accepted_by_user_id: string }>(
      sql`SELECT inv.id, inv.accepted_by_user_id
            FROM public.team_invitations inv
            LEFT JOIN public.app_users u ON u.id = inv.accepted_by_user_id
           WHERE inv.status = 'accepted'
             AND inv.accepted_by_user_id IS NOT NULL
             AND u.id IS NULL`,
    );
    assert.deepStrictEqual(
      orphans,
      [],
      `${orphans.length} accepted invitations reference a missing app_users row`,
    );
  },
);

test(
  "team_invitations has RLS enabled + the two policies from migration 0088",
  { skip: !DB_AVAILABLE },
  async () => {
    const rls = await rawSelect<{ relrowsecurity: boolean }>(
      sql`SELECT relrowsecurity FROM pg_class
           WHERE relname = 'team_invitations'
             AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
    );
    assert.ok(rls[0]?.relrowsecurity, "RLS must be enabled on team_invitations");

    const policies = await rawSelect<{ policyname: string }>(
      sql`SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'team_invitations'`,
    );
    const names = new Set(policies.map((p) => p.policyname));
    assert.ok(
      names.has("team_invitations_org_isolation"),
      "missing team_invitations_org_isolation policy",
    );
    assert.ok(
      names.has("team_invitations_internal_bypass"),
      "missing team_invitations_internal_bypass policy",
    );
  },
);
