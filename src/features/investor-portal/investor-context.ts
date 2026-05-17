import "server-only";

import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { investors } from "@/lib/db/schema/investor-capital";
import { appUsersInvestors } from "@/lib/db/schema/access-grants";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getCurrentUserContext } from "@/features/auth/permissions";

/**
 * Sprint INVESTOR-AUTH — Investor context resolver.
 *
 * Per Phase A audit: no `app_users_investors` grant table exists. The
 * spec halt condition says ship impersonation-only mode in that case
 * (mirrors OWNER-PORTAL-1A which is also impersonation-only because
 * DEMO-2 didn't seed `app_users_owners` grants).
 *
 * Cookie: `__arconique_investor_impersonation` — HttpOnly, Secure,
 * SameSite=Lax, 8h hard ceiling. Validated on every read by
 * re-checking super_admin status.
 *
 * AUTH-INVESTOR-1 follow-up: add app_users_investors table mirroring
 * the access-grants pattern + seed for at least one user → investor
 * link so direct login works.
 */

const IMPERSONATION_COOKIE = "__arconique_investor_impersonation";

export interface InvestorContext {
  investorId: string;
  investorName: string;
  investorCode: string;
  investorType: string;
  organizationId: string;
  isImpersonating: boolean;
  impersonatedBy: string | null;
}

async function loadInvestorById(investorId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);
  return row ?? null;
}

export async function getCurrentInvestorContext(): Promise<InvestorContext | null> {
  const user = await getCurrentAppUser();
  if (!user) return null;
  const db = getDb();

  // Path 1 — active app_users_investors grant.
  if (db) {
    const [grant] = await db
      .select({ investorId: appUsersInvestors.investorId })
      .from(appUsersInvestors)
      .where(
        and(
          eq(appUsersInvestors.appUserId, user.id),
          eq(appUsersInvestors.status, "active"),
          eq(appUsersInvestors.grantType, "investor_portal"),
        ),
      )
      .limit(1);
    if (grant) {
      const inv = await loadInvestorById(grant.investorId);
      if (inv) {
        return {
          investorId: inv.id,
          investorName: inv.legalName,
          investorCode: inv.investorCode,
          investorType: inv.investorType,
          organizationId: inv.organizationId,
          isImpersonating: false,
          impersonatedBy: null,
        };
      }
    }
  }

  // Path 2 — super_admin impersonation.
  const store = await cookies();
  const cookie = store.get(IMPERSONATION_COOKIE);
  if (!cookie?.value) return null;

  const ctx = await getCurrentUserContext();
  if (!ctx.isSuperAdmin) return null;

  const inv = await loadInvestorById(cookie.value);
  if (!inv) return null;
  return {
    investorId: inv.id,
    investorName: inv.legalName,
    investorCode: inv.investorCode,
    investorType: inv.investorType,
    organizationId: inv.organizationId,
    isImpersonating: true,
    impersonatedBy: user.id,
  };
}

export { IMPERSONATION_COOKIE };
