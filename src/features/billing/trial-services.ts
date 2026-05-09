import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema/identity";
import { organizations } from "@/lib/db/schema/saas";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  deriveTrialState,
  type TrialState,
  type TrialStatus,
} from "./trial-state";

/**
 * Stage 10.I.6 — Trial-state lookups for the current request.
 *
 * Single round-trip from the appUsers row to the org's trial fields.
 * Returns null when there's no signed-in user / no DB. The trial banner
 * + the read-only guard + the cron job all consume this helper.
 */

export interface CurrentOrgTrial {
  organizationId: string;
  trialStatus: TrialStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  state: TrialState;
}

export async function getCurrentOrgTrial(): Promise<CurrentOrgTrial | null> {
  const me = await getCurrentAppUser();
  if (!me) return null;
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      organizationId: appUsers.organizationId,
      trialStatus: organizations.trialStatus,
      trialStartedAt: organizations.trialStartedAt,
      trialEndsAt: organizations.trialEndsAt,
    })
    .from(appUsers)
    .innerJoin(organizations, eq(organizations.id, appUsers.organizationId))
    .where(eq(appUsers.id, me.id))
    .limit(1);

  if (!row) return null;

  return {
    organizationId: row.organizationId,
    trialStatus: row.trialStatus as TrialStatus,
    trialStartedAt: row.trialStartedAt,
    trialEndsAt: row.trialEndsAt,
    state: deriveTrialState({
      trialStatus: row.trialStatus as TrialStatus,
      trialStartedAt: row.trialStartedAt,
      trialEndsAt: row.trialEndsAt,
    }),
  };
}
