import { redirect } from "next/navigation";
import { InvestorShell } from "@/components/layout/investor-shell";
import { getCurrentInvestorContext } from "@/features/investor-portal/investor-context";
import { getCurrentAppUser } from "@/features/auth/current-user";

/**
 * INVESTOR-ROUTES — Server-side gate for /investor-portal/*.
 *
 * Impersonation-only mode (no app_users_investors grants seeded).
 *   1. Not signed in → /login?next=/investor-portal
 *   2. Signed in + super_admin + impersonation cookie → proceed
 *   3. Anything else → /dashboard
 */

export const dynamic = "force-dynamic";

export default async function InvestorPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser().catch(() => null);
  if (!user) redirect("/login?next=/investor-portal");
  const ctx = await getCurrentInvestorContext().catch(() => null);
  if (!ctx) redirect("/dashboard/investors");
  const initials = ctx.investorName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <InvestorShell
      ctx={{
        name: ctx.investorName,
        initials,
        investorCode: ctx.investorCode,
        isImpersonating: ctx.isImpersonating,
      }}
    >
      {children}
    </InvestorShell>
  );
}
