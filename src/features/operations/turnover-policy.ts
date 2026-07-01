import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { orgTurnoverPolicy } from "@/lib/db/schema/operations";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * TURNOVER-POLICY read layer (migration 0186).
 *
 * An org's editable turnover-times company policy: the house-standard
 * check-out / check-in clock + the minimum cleaning window. Mirrors the
 * statement-settings pattern (getStatementSettings): org-scoped via
 * requireOrgId(), returns TURNOVER_POLICY_DEFAULTS when no row / no DB so
 * callers never handle null.
 *
 * The DEFAULTS reproduce the turnover board's former hardcodes
 * (STD_CHECKOUT '11:00' / STD_CHECKIN '14:00' + the 180-min gap), so wiring a
 * consumer to this helper changes nothing until an org saves its own policy.
 */
export interface TurnoverPolicy {
  /** House-standard check-out clock, "HH:MM". */
  checkoutTime: string;
  /** House-standard check-in clock, "HH:MM". */
  checkinTime: string;
  /** Minimum cleaning/turnover window in minutes (SLA floor). */
  minTurnoverMinutes: number;
}

export const TURNOVER_POLICY_DEFAULTS: TurnoverPolicy = {
  checkoutTime: "11:00",
  checkinTime: "14:00",
  minTurnoverMinutes: 180,
};

/** Postgres `time` comes back as "HH:MM:SS" — surface the "HH:MM" clock. */
function toHhMm(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const m = /^(\d{2}):(\d{2})/.exec(value.trim());
  return m ? `${m[1]}:${m[2]}` : fallback;
}

/**
 * Org-scoped read (via requireOrgId). Returns the org's turnover policy, or
 * TURNOVER_POLICY_DEFAULTS when no row / no DB. The optional `organizationId`
 * lets cron/agent callers pass an explicit org (mirrors getCleanerWorkloads).
 */
export async function getTurnoverPolicy(
  organizationId: string | null = null,
): Promise<TurnoverPolicy> {
  const db = getDb();
  if (!db) return { ...TURNOVER_POLICY_DEFAULTS };

  const orgId = organizationId ?? (await requireOrgId());

  try {
    const [row] = await db
      .select()
      .from(orgTurnoverPolicy)
      .where(eq(orgTurnoverPolicy.organizationId, orgId))
      .limit(1);

    if (!row) return { ...TURNOVER_POLICY_DEFAULTS };

    return {
      checkoutTime: toHhMm(row.defaultCheckoutTime, TURNOVER_POLICY_DEFAULTS.checkoutTime),
      checkinTime: toHhMm(row.defaultCheckinTime, TURNOVER_POLICY_DEFAULTS.checkinTime),
      minTurnoverMinutes: row.minTurnoverMinutes ?? TURNOVER_POLICY_DEFAULTS.minTurnoverMinutes,
    };
  } catch {
    // Deploy-safety: if the code ships before migration 0186 runs, the table
    // won't exist yet — fall back to the defaults (which equal the former
    // hardcodes) so the turnover board never crashes on a lagging migration.
    return { ...TURNOVER_POLICY_DEFAULTS };
  }
}
