import "server-only";

import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { investors } from "@/lib/db/schema/investor-capital";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import type { ReportingLanguage } from "@/lib/development/constants/investor-constants";

const INVESTOR_ROLE_KEY = "investor_viewer";

export interface InvestorSession {
  /** auth.users.id */
  authUserId: string;
  /** app_users.id — the local user record */
  appUserId: string;
  /** investors.id — the investor this user is bound to */
  investorId: string;
  investorCode: string;
  investorLegalName: string;
  reportingLanguage: ReportingLanguage;
  contactId: string | null;
  email: string;
}

/**
 * Resolves the Supabase auth user → app_users → investors. Returns null
 * UNLESS the user:
 *
 *   1. has a Supabase session,
 *   2. has an app_users row with status='active',
 *   3. is assigned the `investor_viewer` role,
 *   4. has a non-null `investor_id` linking to a real investor.
 *
 * The DB-level RLS migration 0039 also enforces this — the function
 * mirrors that gate at the application layer for clearer 401 handling
 * (defense in depth).
 */
export async function getInvestorSession(): Promise<InvestorSession | null> {
  const auth = await getCurrentAuthUser();
  if (!auth) return null;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({
      appUserId: appUsers.id,
      authUserId: appUsers.authUserId,
      email: appUsers.email,
      status: appUsers.status,
      investorId: appUsers.investorId,
      roleKey: roles.key,
      investorCode: investors.investorCode,
      investorLegalName: investors.legalName,
      reportingLanguage: investors.reportingLanguage,
      contactId: investors.contactId,
    })
    .from(appUsers)
    .innerJoin(userRoles, eq(userRoles.userId, appUsers.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(investors, eq(investors.id, appUsers.investorId))
    .where(
      and(
        eq(appUsers.authUserId, auth.id),
        eq(appUsers.status, "active"),
        eq(roles.key, INVESTOR_ROLE_KEY),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;
  const r = rows[0];
  if (!r.investorId || !r.investorCode || !r.investorLegalName) return null;

  return {
    authUserId: r.authUserId!,
    appUserId: r.appUserId,
    investorId: r.investorId,
    investorCode: r.investorCode,
    investorLegalName: r.investorLegalName,
    reportingLanguage: r.reportingLanguage as ReportingLanguage,
    contactId: r.contactId,
    email: r.email,
  };
}

/**
 * Convenience wrapper — throws when not an investor session. Pages should
 * prefer `getInvestorSession()` + redirect-to-login. Server actions and
 * data fetchers can use this when a 500 is acceptable for the
 * unauthorized case.
 */
export async function requireInvestorSession(): Promise<InvestorSession> {
  const s = await getInvestorSession();
  if (!s) {
    throw new Error(
      "Unauthorized: this endpoint requires an investor portal session",
    );
  }
  return s;
}
