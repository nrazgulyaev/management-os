import "server-only";

import { eq, and, sql, gte } from "drizzle-orm";
import { z } from "zod";
import { requireDb, getDb } from "@/lib/db/client";
import { appUsers, roles } from "@/lib/db/schema/identity";
import { organizations } from "@/lib/db/schema/saas";
import { investors } from "@/lib/db/schema/investor-capital";
import { devNotificationDeliveryLog } from "@/lib/db/schema/sales";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { sendDevOsEmail } from "./email";
import { REPORTING_LANGUAGES } from "@/lib/development/constants/investor-constants";

/**
 * Investor portal access management.
 *
 * Grant flow (`grantInvestorPortalAccess`):
 *   1. Verify caller is internal staff.
 *   2. Rate-limit (5 grants per staff per hour, audited via
 *      dev_notification_delivery_log).
 *   3. Create / refresh app_users row linked to the investor with
 *      role=investor_viewer, status='active'.
 *   4. If `SUPABASE_SERVICE_ROLE_KEY` is configured, create the
 *      Supabase Auth user via the admin API and link auth_user_id.
 *      Otherwise, log a `dry_run_grant` event and instruct the
 *      operator to create the auth user manually via the Supabase
 *      Dashboard.
 *   5. Send welcome email (uses existing `sendDevOsEmail` which
 *      respects EMAIL_DRY_RUN).
 *   6. Audit-log every step to dev_notification_delivery_log.
 *
 * Revoke flow (`revokeInvestorPortalAccess`):
 *   1. Verify caller is internal staff.
 *   2. Set app_users.investor_id = NULL for the investor's user.
 *   3. If admin SDK available, disable the Supabase Auth user.
 *   4. Audit-log.
 *
 * Service role key is consumed only here. Never imported by client
 * components, never logged.
 */

const RATE_LIMIT_PER_HOUR = 5;
const PORTAL_BASE_URL =
  process.env.NEXT_PUBLIC_INVESTOR_PORTAL_URL ?? "https://app.arconique.com/investor-portal";

const grantSchema = z.object({
  investorId: z.string().uuid(),
  email: z.string().email().max(256),
  authMethod: z.enum(["magic_link", "password"]),
  initialPassword: z.string().min(12).optional().nullable(),
  welcomeMessage: z.string().max(2000).optional().nullable(),
  language: z.enum(REPORTING_LANGUAGES).default("en"),
});

export interface GrantAccessResult {
  /** True when the Supabase auth user was created. False in dry-run mode. */
  authUserCreated: boolean;
  /** True when the welcome email was actually sent (vs dry-run logged). */
  emailSent: boolean;
  /** The app_users.id of the granted account. */
  appUserId: string;
  /** Notes — usually the next manual step when in dry-run. */
  notes: string;
}

export async function grantInvestorPortalAccess(
  input: z.input<typeof grantSchema>,
): Promise<GrantAccessResult> {
  const parsed = grantSchema.parse(input);

  // 1. Permission gate.
  const ctx = await requireInternalUser();
  const staffUserId = ctx.appUser?.id ?? null;

  // 2. Validate input combo: password method requires non-empty password
  // with mixed case + at least one number.
  if (parsed.authMethod === "password") {
    if (!parsed.initialPassword) {
      throw new Error("initialPassword required for password auth method");
    }
    if (
      !/[A-Z]/.test(parsed.initialPassword) ||
      !/[a-z]/.test(parsed.initialPassword) ||
      !/[0-9]/.test(parsed.initialPassword)
    ) {
      throw new Error(
        "Password must contain upper, lower, and number characters (≥12 chars)",
      );
    }
  }

  const db = requireDb();

  // 3. Rate limit. We use the audit log itself as the rate-limit
  // counter — every grant attempt writes a row. The 5/hour cap is
  // soft; concurrent racing past it is acceptable since each grant
  // is auditable.
  if (staffUserId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [{ count }] = (await db
      .select({ count: sql<number>`count(*)::int` })
      .from(devNotificationDeliveryLog)
      .where(
        and(
          eq(devNotificationDeliveryLog.templateName, "grant_access_audit"),
          eq(devNotificationDeliveryLog.recipientUserId, staffUserId),
          gte(devNotificationDeliveryLog.createdAt, oneHourAgo),
        ),
      )) as Array<{ count: number }>;
    if (count >= RATE_LIMIT_PER_HOUR) {
      throw new Error(
        `Rate limit: ${RATE_LIMIT_PER_HOUR} grants per staff per hour. Try again later.`,
      );
    }
  }

  // 4. Resolve the investor + investor_viewer role.
  const [investor] = await db
    .select({
      id: investors.id,
      legalName: investors.legalName,
      reportingLanguage: investors.reportingLanguage,
    })
    .from(investors)
    .where(eq(investors.id, parsed.investorId))
    .limit(1);
  if (!investor) throw new Error("Investor not found");

  const [investorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, "investor_viewer"))
    .limit(1);
  if (!investorRole) {
    throw new Error("investor_viewer role not seeded — run npm run db:seed first");
  }

  // 5. Optionally create the Supabase auth user.
  const admin = getSupabaseAdmin();
  let authUserId: string | null = null;
  let dryRun = false;
  if (admin) {
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.email,
      password:
        parsed.authMethod === "password" ? parsed.initialPassword! : undefined,
      email_confirm: true,
      user_metadata: {
        investor_id: parsed.investorId,
        granted_by_staff_user_id: staffUserId,
      },
    });
    if (error) {
      // The most common case: user already exists. Try to look up.
      const { data: list } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const existing = list?.users.find((u) => u.email === parsed.email);
      if (existing) {
        authUserId = existing.id;
      } else {
        throw new Error(`Supabase admin createUser failed: ${error.message}`);
      }
    } else {
      authUserId = data.user?.id ?? null;
    }
  } else {
    dryRun = true;
  }

  // 6. Upsert the app_users row — atomic with the user_roles link.
  // Stage 9.0 third attempt — app_users.organization_id is NOT NULL.
  // Investors are tied to ARCONIQUE_DEFAULT (Stage 5.J seed). For
  // multi-tenant investor portals later, this would resolve from the
  // investor's parent org instead.
  const [arconiqueDefault] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.organizationCode, "ARCONIQUE_DEFAULT"))
    .limit(1);
  if (!arconiqueDefault) {
    throw new Error(
      "ARCONIQUE_DEFAULT organization is missing — apply migration 0071 before granting investor access.",
    );
  }
  const arconiqueOrgId = arconiqueDefault.id;
  const result = await db.transaction(async (tx) => {
    const [up] = await tx
      .insert(appUsers)
      .values({
        email: parsed.email,
        fullName: investor.legalName,
        organizationId: arconiqueOrgId,
        status: authUserId ? "active" : "invited",
        investorId: parsed.investorId,
        authUserId: authUserId ?? null,
      })
      .onConflictDoUpdate({
        target: appUsers.email,
        set: {
          investorId: parsed.investorId,
          status: authUserId ? "active" : "invited",
          authUserId: authUserId ?? null,
          fullName: investor.legalName,
          updatedAt: new Date(),
        },
      })
      .returning({ id: appUsers.id });

    // Grant the investor_viewer role idempotently.
    await tx.execute(sql`
      INSERT INTO user_roles (user_id, role_id)
      SELECT ${up.id}, ${investorRole.id}
      WHERE NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = ${up.id} AND role_id = ${investorRole.id}
      )
    `);

    return { appUserId: up.id };
  });

  // 7. Send welcome email (dry-run unless EMAIL_DRY_RUN=0 + RESEND_API_KEY).
  const emailResult = await sendDevOsEmail({
    to: parsed.email,
    toName: investor.legalName,
    subject: `Welcome to the Arconique Investor Portal`,
    bodyHtml: buildWelcomeBodyHtml({
      legalName: investor.legalName,
      welcomeMessage: parsed.welcomeMessage ?? null,
      authMethod: parsed.authMethod,
      initialPassword:
        parsed.authMethod === "password" ? parsed.initialPassword! : null,
      portalUrl: PORTAL_BASE_URL,
      language: parsed.language,
    }),
    bodyText: buildWelcomeBodyText({
      legalName: investor.legalName,
      welcomeMessage: parsed.welcomeMessage ?? null,
      authMethod: parsed.authMethod,
      initialPassword:
        parsed.authMethod === "password" ? parsed.initialPassword! : null,
      portalUrl: PORTAL_BASE_URL,
      language: parsed.language,
    }),
    metadata: {
      triggerEntityType: "investor_portal_access",
      triggerEntityId: parsed.investorId,
      templateName: "investor_portal_welcome",
      recipientUserId: result.appUserId,
    },
  });

  // 8. Audit-log the grant action itself (the rate-limit counter
  // reads this row).
  await db.insert(devNotificationDeliveryLog).values({
    organizationId: arconiqueOrgId,
    triggerEntityType: "investor_portal_access",
    triggerEntityId: parsed.investorId,
    recipientUserId: staffUserId,
    recipientAddress: parsed.email,
    channel: "in_app",
    templateName: "grant_access_audit",
    subject: dryRun
      ? `Grant access (DRY RUN — service key absent) for ${investor.legalName}`
      : `Granted portal access to ${investor.legalName}`,
    body: JSON.stringify({
      investorId: parsed.investorId,
      authMethod: parsed.authMethod,
      authUserId,
      dryRun,
    }),
    status: dryRun ? "failed" : "sent",
    sentAt: new Date(),
    errorReason: dryRun
      ? "service_role_key_absent — manual auth user creation required"
      : null,
  });

  return {
    authUserCreated: !!authUserId,
    emailSent: emailResult.status === "sent",
    appUserId: result.appUserId,
    notes: dryRun
      ? `DRY RUN: SUPABASE_SERVICE_ROLE_KEY not set. Create the auth user manually in the Supabase Dashboard, then UPDATE app_users SET auth_user_id = '<uid>', status = 'active' WHERE id = '${result.appUserId}'.`
      : `Granted. Welcome email ${emailResult.status === "sent" ? "delivered" : "queued (dry-run)"}.`,
  };
}

const revokeSchema = z.object({
  investorId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function revokeInvestorPortalAccess(
  input: z.input<typeof revokeSchema>,
): Promise<{ revoked: boolean; appUserId: string | null; notes: string }> {
  const parsed = revokeSchema.parse(input);
  const ctx = await requireInternalUser();
  const staffUserId = ctx.appUser?.id ?? null;

  const db = requireDb();
  const organizationId = await requireOrgId();
  const [user] = await db
    .select({
      id: appUsers.id,
      authUserId: appUsers.authUserId,
      email: appUsers.email,
    })
    .from(appUsers)
    .where(eq(appUsers.investorId, parsed.investorId))
    .limit(1);
  if (!user) {
    return {
      revoked: false,
      appUserId: null,
      notes: "No portal user is linked to this investor.",
    };
  }

  // Disable the Supabase auth user if the admin SDK is configured.
  const admin = getSupabaseAdmin();
  if (admin && user.authUserId) {
    const { error } = await admin.auth.admin.updateUserById(user.authUserId, {
      user_metadata: { revoked_at: new Date().toISOString() },
      ban_duration: "876600h", // ~100 years; effectively permanent
    });
    if (error) {
      // Don't throw — local status update + audit log still proceed.
      // The operator should follow up in the dashboard.
      console.warn(
        `[revokeInvestorPortalAccess] Supabase ban failed: ${error.message}`,
      );
    }
  }

  await db
    .update(appUsers)
    .set({
      investorId: null,
      status: "suspended",
      updatedAt: new Date(),
    })
    .where(eq(appUsers.id, user.id));

  await db.insert(devNotificationDeliveryLog).values({
    organizationId,
    triggerEntityType: "investor_portal_access",
    triggerEntityId: parsed.investorId,
    recipientUserId: staffUserId,
    recipientAddress: user.email,
    channel: "in_app",
    templateName: "revoke_access_audit",
    subject: `Revoked portal access for investor ${parsed.investorId}`,
    body: JSON.stringify({
      reason: parsed.reason,
      authUserId: user.authUserId,
    }),
    status: "sent",
    sentAt: new Date(),
  });

  return {
    revoked: true,
    appUserId: user.id,
    notes: admin
      ? "Portal access revoked + Supabase auth user banned."
      : "Portal access revoked (app_users.investor_id cleared). Disable the Supabase auth user manually in the Dashboard.",
  };
}

export interface InvestorAccessStatus {
  hasAccess: boolean;
  appUserId: string | null;
  email: string | null;
  status: string | null;
  authUserId: string | null;
  grantedAt: string | null;
}

export async function getInvestorAccessStatus(
  investorId: string,
): Promise<InvestorAccessStatus> {
  const db = getDb();
  if (!db) {
    return {
      hasAccess: false,
      appUserId: null,
      email: null,
      status: null,
      authUserId: null,
      grantedAt: null,
    };
  }
  const [u] = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      status: appUsers.status,
      authUserId: appUsers.authUserId,
      createdAt: appUsers.createdAt,
    })
    .from(appUsers)
    .where(eq(appUsers.investorId, investorId))
    .limit(1);
  if (!u) {
    return {
      hasAccess: false,
      appUserId: null,
      email: null,
      status: null,
      authUserId: null,
      grantedAt: null,
    };
  }
  return {
    hasAccess: u.status === "active" || u.status === "invited",
    appUserId: u.id,
    email: u.email,
    status: u.status,
    authUserId: u.authUserId ?? null,
    grantedAt: new Date(u.createdAt).toISOString(),
  };
}

// ----------------------------------------------------------------------------
// Email body builders — kept inline + simple, no template engine. RU/EN,
// `language` controls localization. ID/ZH fall back to EN.
// ----------------------------------------------------------------------------

interface WelcomeArgs {
  legalName: string;
  welcomeMessage: string | null;
  authMethod: "magic_link" | "password";
  initialPassword: string | null;
  portalUrl: string;
  language: "en" | "ru" | "id" | "zh";
}

function buildWelcomeBodyText(a: WelcomeArgs): string {
  if (a.language === "ru") {
    return [
      `Здравствуйте, ${a.legalName}.`,
      ``,
      a.welcomeMessage ?? `Arconique создал для вас доступ к Инвесторскому порталу.`,
      ``,
      `Войдите по адресу: ${a.portalUrl}`,
      a.authMethod === "password"
        ? `Временный пароль: ${a.initialPassword}\nПожалуйста, измените его при первом входе.`
        : `Используйте ссылку входа в письме от Supabase Auth.`,
      ``,
      `С уважением, команда Arconique.`,
    ].join("\n");
  }
  return [
    `Hello ${a.legalName},`,
    ``,
    a.welcomeMessage ??
      `Arconique has set up your Investor Portal access. You can now view your commitments, distributions, and wallet activity at any time.`,
    ``,
    `Sign in at: ${a.portalUrl}`,
    a.authMethod === "password"
      ? `Temporary password: ${a.initialPassword}\nPlease change it on first sign-in.`
      : `Use the magic link in your Supabase auth email.`,
    ``,
    `If you have questions, reply to this email or contact your account manager.`,
    ``,
    `Best regards,`,
    `The Arconique team`,
  ].join("\n");
}

function buildWelcomeBodyHtml(a: WelcomeArgs): string {
  const text = buildWelcomeBodyText(a);
  // Simple HTML wrapper around the text body — no marketing chrome.
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<div style="font-family: -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px;">${escaped
    .split("\n")
    .map((l) => (l.length === 0 ? "<br>" : `<p style="margin: 0 0 8px;">${l}</p>`))
    .join("\n")}</div>`;
}
