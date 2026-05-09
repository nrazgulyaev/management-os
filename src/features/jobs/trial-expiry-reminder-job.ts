import "server-only";

import { and, asc, eq, gte, isNull, lt, lte, or, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { appUsers } from "@/lib/db/schema/identity";
import { userRoles, roles } from "@/lib/db/schema/identity";
import {
  sendEmail,
  trialExpiryEmailTemplate,
} from "@/features/email";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * Stage 10.L — Daily trial-expiry-reminder sweep.
 * Stage 11.A — hardened with per-day dedupe + super_admin fallback.
 *
 * Finds orgs whose trial ends in the next 0-3 days (T-3 / T-2 / T-1 /
 * T-0) and emails each org's owner with the trial-expiry template.
 *
 * Hardening (Stage 11.A):
 *   - Dedupe via `organizations.last_trial_reminder_at`: skip orgs
 *     whose stamp is already on the current calendar day. Multiple cron
 *     firings on the same day are no-ops.
 *   - Super_admin fallback: if no super_admin user exists for the org
 *     (legacy provisioned org, or revoked role), fall back to the
 *     first active app_user under that org. The job logs a warning to
 *     the metrics but doesn't fail.
 *   - Stamp `last_trial_reminder_at = now()` on every org we
 *     successfully attempted (sent OR skipped) so subsequent retries
 *     within the same day are no-ops. Failed sends DON'T stamp — the
 *     next day's run will retry.
 *
 * Schedule: daily, off-peak. Auth: shared `CRON_SECRET` envelope.
 */
export async function runTrialExpiryReminderJob(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "success",
      summary: "DB not configured — no-op",
      metrics: { sentCount: 0, skipped: true },
    };
  }

  // Find orgs in active trial whose trial ends in [now, now + 3 days],
  // AND who haven't been reminded yet today (NULL OR < start-of-today).
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const candidates = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      trialEndsAt: organizations.trialEndsAt,
      lastReminderAt: organizations.lastTrialReminderAt,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.trialStatus, "active"),
        gte(organizations.trialEndsAt, now),
        lte(organizations.trialEndsAt, horizon),
        or(
          isNull(organizations.lastTrialReminderAt),
          lt(organizations.lastTrialReminderAt, startOfToday),
        ),
      ),
    );

  if (candidates.length === 0) {
    return {
      status: "success",
      summary: "No trials need a reminder right now",
      metrics: { sentCount: 0, candidatesCount: 0, dedupedCount: 0 },
    };
  }

  const orgIds = candidates.map((c) => c.id);

  // Pull super_admin owners per org. May return 0 rows for orgs that
  // lost their super_admin (legacy provisioning, revoked role, etc.) —
  // those orgs fall through to the fallback.
  const superAdminRows = await db
    .select({
      organizationId: appUsers.organizationId,
      email: appUsers.email,
      fullName: appUsers.fullName,
    })
    .from(appUsers)
    .innerJoin(userRoles, eq(userRoles.userId, appUsers.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        inArray(appUsers.organizationId, orgIds),
        eq(roles.key, "super_admin"),
        eq(appUsers.status, "active"),
      ),
    );

  const ownersByOrg = new Map<
    string,
    { email: string; fullName: string }[]
  >();
  for (const r of superAdminRows) {
    if (!r.organizationId) continue;
    if (!ownersByOrg.has(r.organizationId)) {
      ownersByOrg.set(r.organizationId, []);
    }
    ownersByOrg.get(r.organizationId)!.push({
      email: r.email,
      fullName: r.fullName,
    });
  }

  // Stage 11.A — fallback: orgs with no super_admin get the FIRST
  // active app_user under that org instead. Log to metrics so operators
  // know which orgs are mis-provisioned.
  const orgsNeedingFallback = orgIds.filter((id) => !ownersByOrg.has(id));
  let fallbackUsedCount = 0;
  if (orgsNeedingFallback.length > 0) {
    const fallbackRows = await db
      .select({
        organizationId: appUsers.organizationId,
        email: appUsers.email,
        fullName: appUsers.fullName,
      })
      .from(appUsers)
      .where(
        and(
          inArray(appUsers.organizationId, orgsNeedingFallback),
          eq(appUsers.status, "active"),
        ),
      )
      .orderBy(asc(appUsers.createdAt));

    for (const r of fallbackRows) {
      if (!r.organizationId) continue;
      if (ownersByOrg.has(r.organizationId)) continue; // first one only
      ownersByOrg.set(r.organizationId, [
        { email: r.email, fullName: r.fullName },
      ]);
      fallbackUsedCount += 1;
    }
  }

  const baseUrl =
    process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "https://arconique.com";

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let stampedCount = 0;
  let noOwnerCount = 0;

  for (const org of candidates) {
    const owners = ownersByOrg.get(org.id) ?? [];
    if (owners.length === 0) {
      noOwnerCount += 1;
      continue;
    }
    const endsAt = org.trialEndsAt;
    if (!endsAt) continue;
    const daysRemaining = Math.ceil(
      (endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    const upgradeUrl = `${baseUrl}/dashboard/billing/upgrade?from=trial-reminder`;

    let attemptedAtLeastOne = false;
    let allFailed = true;
    for (const owner of owners) {
      attemptedAtLeastOne = true;
      const result = await sendEmail(
        owner.email,
        trialExpiryEmailTemplate,
        {
          recipientName: owner.fullName,
          organizationName: org.name,
          daysRemaining,
          trialEndsOn: endsAt.toISOString().slice(0, 10),
          upgradeUrl,
        },
      );
      if (result.ok && !result.skipped) {
        sent += 1;
        allFailed = false;
      } else if (result.ok && result.skipped) {
        skipped += 1;
        allFailed = false;
      } else {
        failed += 1;
      }
    }

    // Stamp last_trial_reminder_at when at least one attempt succeeded
    // (sent OR skipped — Resend-not-configured is still a "we tried"
    // signal). Failed-only attempts DON'T stamp; tomorrow's run retries.
    if (attemptedAtLeastOne && !allFailed) {
      try {
        await db
          .update(organizations)
          .set({ lastTrialReminderAt: sql`now()` })
          .where(eq(organizations.id, org.id));
        stampedCount += 1;
      } catch {
        // stamping failed (DB blip) — better to over-send tomorrow than fail the job
      }
    }
  }

  return {
    status: "success",
    summary: `Sent ${sent} reminder${sent === 1 ? "" : "s"} (${skipped} skipped, ${failed} failed, ${noOwnerCount} no-owner) across ${candidates.length} expiring trial${candidates.length === 1 ? "" : "s"}`,
    metrics: {
      candidatesCount: candidates.length,
      sentCount: sent,
      skippedCount: skipped,
      failedCount: failed,
      noOwnerCount,
      fallbackUsedCount,
      stampedCount,
      horizonIso: horizon.toISOString(),
    },
  };
}
