import "server-only";

import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { appUsers } from "@/lib/db/schema/identity";
import { userRoles, roles } from "@/lib/db/schema/identity";
import { sendEmail, trialExpiryEmailTemplate } from "@/features/email";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * Stage 10.L — Daily trial-expiry-reminder sweep.
 *
 * Finds orgs whose trial ends in the next 0-3 days (T-3 / T-2 / T-1 /
 * T-0) and emails each org's super_admin user(s) with the
 * `trialExpiryEmailTemplate`. Idempotent per (org, day) by design:
 * runs daily, the email service is no-op if Resend unconfigured, and
 * we don't track per-day-already-sent state — duplicate reminders on
 * a single day would only happen if the cron itself runs multiple
 * times (which the standard cron envelope prevents via job-locks).
 *
 * Schedule: daily, off-peak (vercel.json — operator-owned). Auth:
 * shared `CRON_SECRET` envelope (Stage 8.E.1 / 10.G).
 *
 * Email send is via the Stage 10.G transactional `sendEmail()` stub
 * which Stage 10.L wired to live Resend — `RESEND_API_KEY` unset
 * means the body is logged + returns `{ ok:true, skipped:true }`.
 * Either way the job records sent + skipped counts in metrics.
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

  // Find orgs in active trial whose trial ends in [now, now + 3 days].
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const candidates = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      trialEndsAt: organizations.trialEndsAt,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.trialStatus, "active"),
        gte(organizations.trialEndsAt, now),
        lte(organizations.trialEndsAt, horizon),
      ),
    );

  if (candidates.length === 0) {
    return {
      status: "success",
      summary: "No trials expiring in the next 3 days",
      metrics: { sentCount: 0, candidatesCount: 0 },
    };
  }

  const orgIds = candidates.map((c) => c.id);

  // For each org, find super_admin users (the org owner created at signup).
  const ownerRows = await db
    .select({
      organizationId: appUsers.organizationId,
      email: appUsers.email,
      fullName: appUsers.fullName,
      roleKey: roles.key,
    })
    .from(appUsers)
    .innerJoin(userRoles, eq(userRoles.userId, appUsers.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        inArray(appUsers.organizationId, orgIds),
        eq(roles.key, "super_admin"),
      ),
    );

  const ownersByOrg = new Map<
    string,
    { email: string; fullName: string }[]
  >();
  for (const r of ownerRows) {
    if (!r.organizationId) continue;
    if (!ownersByOrg.has(r.organizationId)) {
      ownersByOrg.set(r.organizationId, []);
    }
    ownersByOrg.get(r.organizationId)!.push({
      email: r.email,
      fullName: r.fullName,
    });
  }

  const baseUrl =
    process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "https://arconique.com";

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const org of candidates) {
    const owners = ownersByOrg.get(org.id) ?? [];
    if (owners.length === 0) continue;
    const endsAt = org.trialEndsAt;
    if (!endsAt) continue;
    const daysRemaining = Math.ceil(
      (endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    const upgradeUrl = `${baseUrl}/dashboard/billing/upgrade?from=trial-reminder`;
    for (const owner of owners) {
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
      if (result.ok && !result.skipped) sent += 1;
      else if (result.ok && result.skipped) skipped += 1;
      else failed += 1;
    }
  }

  return {
    status: "success",
    summary: `Sent ${sent} reminder${sent === 1 ? "" : "s"} (${skipped} skipped, ${failed} failed) across ${candidates.length} expiring trial${candidates.length === 1 ? "" : "s"}`,
    metrics: {
      candidatesCount: candidates.length,
      sentCount: sent,
      skippedCount: skipped,
      failedCount: failed,
      horizonIso: horizon.toISOString(),
    },
  };
}
